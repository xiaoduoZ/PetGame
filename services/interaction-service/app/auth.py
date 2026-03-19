# app/auth.py
import os
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2AuthorizationCodeBearer

KEYCLOAK_ISSUER = os.getenv("KEYCLOAK_ISSUER", "http://localhost:8080/realms/petgame")
KEYCLOAK_JWKS_URL = os.getenv(
    "KEYCLOAK_JWKS_URL",
    "http://host.docker.internal:8080/realms/petgame/protocol/openid-connect/certs",
)
KEYCLOAK_AUDIENCE = os.getenv("KEYCLOAK_AUDIENCE", "petgame-api")

# 这两个 URL 是给 Swagger 在浏览器里用的，所以必须是 localhost:8080
KEYCLOAK_PUBLIC_BASE = os.getenv("KEYCLOAK_PUBLIC_BASE", "http://localhost:8080")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "petgame")

AUTH_URL = f"{KEYCLOAK_PUBLIC_BASE}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/auth"
TOKEN_URL = f"{KEYCLOAK_PUBLIC_BASE}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"

oauth2_scheme = OAuth2AuthorizationCodeBearer(
    authorizationUrl=AUTH_URL,
    tokenUrl=TOKEN_URL,
    scopes={"openid": "OpenID Connect"},
)

jwks_client = jwt.PyJWKClient(KEYCLOAK_JWKS_URL)

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=KEYCLOAK_AUDIENCE,
            issuer=KEYCLOAK_ISSUER,
        )

        user_id = payload.get("preferred_username") or payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token has no usable user identity")

        return {
            "sub": payload.get("sub"),
            "user_id": user_id,
            "roles": payload.get("realm_access", {}).get("roles", []),
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")