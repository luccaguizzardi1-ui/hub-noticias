"""Cifra la edición para publicarla: sin la clave de Lucca no se lee ninguna nota.

Formato (edicion.cifrada.json), pensado para descifrarse en el navegador con WebCrypto:
  clave = PBKDF2-SHA256(frase, sal, iteraciones) -> 256 bits
  datos = AES-256-GCM(clave, iv, gzip(json de la edición))   (el tag va al final, como en WebCrypto)
La sal es fija para que la app pueda guardar la clave derivada una sola vez; el iv cambia
en cada edición. "generada" va a la vista para saber si hay edición nueva sin descifrar.
"""
import base64
import gzip
import json
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITERACIONES = 600_000
# Sal pública y fija del diario (no es secreta; lo secreto es la frase).
SAL = base64.b64decode("s+FwRaN+Gmm4uMLVVx0JFw==")


def _b64(b):
    return base64.b64encode(b).decode()


def derivar(frase, sal=SAL, iteraciones=ITERACIONES):
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sal, iterations=iteraciones)
    return kdf.derive(frase.encode("utf-8"))


def cifrar(edicion, frase):
    clave = derivar(frase)
    iv = os.urandom(12)
    plano = gzip.compress(json.dumps(edicion, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)
    return {
        "v": 1,
        "kdf": "PBKDF2-SHA256",
        "iteraciones": ITERACIONES,
        "sal": _b64(SAL),
        "iv": _b64(iv),
        "generada": edicion["generada"],
        "datos": _b64(AESGCM(clave).encrypt(iv, plano, None)),
    }


def descifrar(sobre, frase):
    clave = derivar(frase, base64.b64decode(sobre["sal"]), sobre["iteraciones"])
    plano = AESGCM(clave).decrypt(base64.b64decode(sobre["iv"]), base64.b64decode(sobre["datos"]), None)
    return json.loads(gzip.decompress(plano))
