from flask import Flask, jsonify, request
import os
import logging
import jaydebeapi
import json

# Konfiguracija logovanja
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("sku-translator")

# Inicijalizacija Flask aplikacije
app = Flask(__name__)

# Konfiguracija iz env varijabli
PORT = int(os.environ.get("PORT", 3002))
DB_HOST = os.environ.get("INFORMIX_HOST", "informix-host")
DB_PORT = os.environ.get("INFORMIX_PORT", 9088)
DB_NAME = os.environ.get("INFORMIX_DB", "database")
DB_USER = os.environ.get("INFORMIX_USER", "informix")
DB_PASSWORD = os.environ.get("INFORMIX_PASSWORD", "password")
DB_SERVER = os.environ.get("INFORMIX_SERVER", "ol_informix1170")

# JDBC URL za Informix
JDBC_URL = f"jdbc:informix-sqli://{DB_HOST}:{DB_PORT}/{DB_NAME}:INFORMIXSERVER={DB_SERVER}"
JDBC_DRIVER = "com.informix.jdbc.IfxDriver"
JDBC_JAR = "/usr/src/app/drivers/ifxjdbc.jar"

# Globalna konekcija
conn = None

# Mock mapiranje za testiranje
mock_sku_mapping = {
    "KSKUA12345678": "RSKUA12345678",
    "KSKUB87654321": "RSKUB87654321"
}

def get_mock_sku(catalog_sku):
    """Vraća mock SKU za testiranje."""
    return mock_sku_mapping.get(catalog_sku, catalog_sku)

def init_connection():
    """Inicijalizuje konekciju sa bazom."""
    global conn

    try:
        logger.info(f"Povezivanje sa Informix bazom: {JDBC_URL}")
        conn = jaydebeapi.connect(
            JDBC_DRIVER,
            JDBC_URL,
            [DB_USER, DB_PASSWORD],
            JDBC_JAR
        )
        logger.info("Uspešno povezivanje sa bazom")
        return True
    except Exception as e:
        logger.error(f"Greška pri povezivanju sa bazom: {e}")
        conn = None
        return False

def get_sku_from_db(catalog_sku):
    """Dobavlja SKU iz baze podataka."""
    global conn

    if conn is None:
        success = init_connection()
        if not success:
            return None

    try:
        # Prilagodite SQL prema vašoj šemi baze
        sql = f"SELECT sif_rob AS sku FROM roba WHERE kat_bro = '{catalog_sku}' LIMIT 1"

        cursor = conn.cursor()
        cursor.execute(sql)

        result = cursor.fetchone()
        cursor.close()

        if result and len(result) > 0:
            return result[0]
        else:
            logger.info(f"Nije pronađen SKU za kataloški broj: {catalog_sku}")
            return None
    except Exception as e:
        logger.error(f"Greška pri upitu baze: {e}")
        # Pokušaj ponovo da inicijalizuješ konekciju
        conn = None
        return None

@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "SKU Translator servis je aktivan (Python verzija)"})

@app.route("/translate/<catalog_sku>", methods=["GET"])
def translate_sku(catalog_sku):
    """Endpoint za prevođenje pojedinačnog kataloškog SKU."""
    if not catalog_sku:
        return jsonify({"error": "Nedostaje kataloški SKU"}), 400

    try:
        # Pokušaj da dobiješ SKU iz baze
        sku = get_sku_from_db(catalog_sku)

        # Ako nije uspeo upit baze, koristi mock
        if sku is None:
            logger.info(f"Korišćenje mock mapiranja za {catalog_sku}")
            sku = get_mock_sku(catalog_sku)

        return jsonify({
            "catalogSku": catalog_sku,
            "sku": sku
        })
    except Exception as e:
        logger.error(f"Greška pri prevođenju SKU: {e}")
        return jsonify({
            "error": "Interna greška servera",
            "fallback": catalog_sku
        }), 500

@app.route("/translate-batch", methods=["POST"])
def translate_batch():
    """Batch prevođenje za više kataloških SKU odjednom."""
    data = request.get_json()

    if not data or "catalogSkus" not in data or not isinstance(data["catalogSkus"], list) or len(data["catalogSkus"]) == 0:
        return jsonify({"error": "Nedostaje niz kataloških SKU"}), 400

    try:
        catalog_skus = data["catalogSkus"]
        results = {}

        for catalog_sku in catalog_skus:
            # Pokušaj da dobiješ SKU iz baze
            sku = get_sku_from_db(catalog_sku)

            # Ako nije uspeo upit baze, koristi mock
            if sku is None:
                sku = get_mock_sku(catalog_sku)

            results[catalog_sku] = sku

        return jsonify({"translations": results})
    except Exception as e:
        logger.error(f"Greška pri batch prevođenju SKU: {e}")
        return jsonify({"error": "Interna greška servera"}), 500

@app.route("/refresh-cache", methods=["POST"])
def refresh_cache():
    """Endpoint za osvežavanje cache-a mapiranja."""
    try:
        # Ovde bi išla implementacija za osvežavanje cache-a
        logger.info("Osvežavanje cache-a mapiranja SKU...")

        # Zatvaranje i ponovno otvaranje konekcije
        global conn
        if conn:
            try:
                conn.close()
            except:
                pass
        conn = None
        init_connection()

        return jsonify({
            "success": True,
            "message": "Cache osvežen"
        })
    except Exception as e:
        logger.error(f"Greška pri osvežavanju cache-a: {e}")
        return jsonify({"error": "Interna greška servera"}), 500

if __name__ == "__main__":
    # Pokušaj inicijalne konekcije sa bazom
    init_connection()

    # Pokretanje Flask aplikacije
    app.run(host="0.0.0.0", port=PORT)