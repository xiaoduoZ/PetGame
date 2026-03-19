# services/pet-service/app/mq_consumer.py
import os
import json
import time
import threading
import pika
import logging

from .db import SessionLocal
from .models import Pet, ProcessedEvent

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
EXCHANGE_NAME = "petgame.events"
QUEUE_NAME = "pet-events"

logger = logging.getLogger("petgame.pet.consumer")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))


def _already_processed(db, event_id: str) -> bool:
    return db.query(ProcessedEvent).filter(ProcessedEvent.event_id == event_id).first() is not None


def process_completed_event(event: dict):
    db = SessionLocal()
    try:
        event_id = event["event_id"]
        if _already_processed(db, event_id):
            logger.info("event already processed event_id=%s type=%s", event_id, event.get("event_type"))
            return

        user_id = event["user_id"]
        hp_delta = int(event.get("hp_delta", 0))
        xp_reward = int(event.get("xp_reward", 0))

        pet = db.query(Pet).filter(Pet.user_id == user_id).first()
        created = False
        if not pet:
            pet = Pet(
                user_id=user_id,
                name="Mochi",
                hp=100,
                xp=0,
                level=1,
                mood=5,
                streak=0
            )
            db.add(pet)
            db.flush()
            created = True

        old_hp, old_xp, old_level = pet.hp, pet.xp, pet.level

        pet.hp += hp_delta
        pet.xp += xp_reward
        pet.level = (pet.xp // 100) + 1

        processed = ProcessedEvent(event_id=event_id, event_type=event.get("event_type", "interaction.completed"))
        db.add(processed)

        db.commit()

        if created:
            logger.info("created pet during completed-event user=%s name=%s", user_id, pet.name)

        logger.info(
            "processed interaction.completed event_id=%s user=%s hp:%d->%d xp:%d->%d level:%d->%d delta_hp=%d delta_xp=%d",
            event_id, user_id,
            old_hp, pet.hp,
            old_xp, pet.xp,
            old_level, pet.level,
            hp_delta, xp_reward
        )

    except Exception:
        db.rollback()
        logger.exception("error processing interaction.completed event=%s", event)
        raise
    finally:
        db.close()


def process_missed_event(event: dict):
    db = SessionLocal()
    try:
        event_id = event["event_id"]
        if _already_processed(db, event_id):
            logger.info("event already processed event_id=%s type=%s", event_id, event.get("event_type"))
            return

        user_id = event["user_id"]
        hp_delta = int(event.get("hp_delta", -10))
        mood_delta = int(event.get("mood_delta", -1))

        pet = db.query(Pet).filter(Pet.user_id == user_id).first()
        created = False
        if not pet:
            pet = Pet(
                user_id=user_id,
                name="Mochi",
                hp=100,
                xp=0,
                level=1,
                mood=5,
                streak=0
            )
            db.add(pet)
            db.flush()
            created = True

        old_hp, old_mood, old_streak = pet.hp, pet.mood, pet.streak

        pet.hp += hp_delta
        pet.mood += mood_delta
        pet.streak = 0

        if pet.hp < 0:
            pet.hp = 0
        if pet.mood < 0:
            pet.mood = 0

        processed = ProcessedEvent(event_id=event_id, event_type=event.get("event_type", "interaction.missed"))
        db.add(processed)

        db.commit()

        if created:
            logger.info("created pet during missed-event user=%s name=%s", user_id, pet.name)

        logger.info(
            "processed interaction.missed event_id=%s user=%s hp:%d->%d mood:%d->%d streak:%d->%d delta_hp=%d delta_mood=%d",
            event_id, user_id,
            old_hp, pet.hp,
            old_mood, pet.mood,
            old_streak, pet.streak,
            hp_delta, mood_delta
        )

    except Exception:
        db.rollback()
        logger.exception("error processing interaction.missed event=%s", event)
        raise
    finally:
        db.close()


def start_consumer():
    def _run():
        while True:
            try:
                params = pika.URLParameters(RABBITMQ_URL)
                connection = pika.BlockingConnection(params)
                channel = connection.channel()

                channel.exchange_declare(
                    exchange=EXCHANGE_NAME,
                    exchange_type="topic",
                    durable=True
                )

                channel.queue_declare(queue=QUEUE_NAME, durable=True)

                channel.queue_bind(exchange=EXCHANGE_NAME, queue=QUEUE_NAME, routing_key="interaction.completed")
                channel.queue_bind(exchange=EXCHANGE_NAME, queue=QUEUE_NAME, routing_key="interaction.missed")

                def callback(ch, method, properties, body):
                    try:
                        event = json.loads(body.decode("utf-8"))
                        et = event.get("event_type")

                        if et == "interaction.completed":
                            process_completed_event(event)
                        elif et == "interaction.missed":
                            process_missed_event(event)
                        else:
                            logger.warning("unknown event_type=%s event=%s", et, event)

                        ch.basic_ack(delivery_tag=method.delivery_tag)

                    except Exception:
                        logger.exception("consumer callback error body=%s", body)
                        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

                channel.basic_qos(prefetch_count=1)
                channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)

                logger.info("rabbitmq consumer started exchange=%s queue=%s", EXCHANGE_NAME, QUEUE_NAME)
                channel.start_consuming()

            except Exception:
                logger.exception("rabbitmq connection failed, retrying in 5s")
                time.sleep(5)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()