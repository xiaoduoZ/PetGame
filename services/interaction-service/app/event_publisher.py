import os
import json
import pika

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
EXCHANGE_NAME = "petgame.events"


def publish_interaction_completed(event: dict):
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()

    channel.exchange_declare(
        exchange=EXCHANGE_NAME,
        exchange_type="topic",
        durable=True
    )

    channel.basic_publish(
        exchange=EXCHANGE_NAME,
        routing_key="interaction.completed",
        body=json.dumps(event),
        properties=pika.BasicProperties(
            delivery_mode=2
        )
    )

    connection.close()

def publish_interaction_missed(event: dict):
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()

    channel.exchange_declare(
        exchange=EXCHANGE_NAME,
        exchange_type="topic",
        durable=True
    )

    channel.basic_publish(
        exchange=EXCHANGE_NAME,
        routing_key="interaction.missed",
        body=json.dumps(event),
        properties=pika.BasicProperties(delivery_mode=2)
    )

    connection.close()