# MinIO S3 sistem za upravljanje fotografijama proizvoda

Kompletan sistem za skladištenje, obradu i organizaciju fotografija proizvoda sa automatskom sinhronizacijom preko FTP-a.

## Sadržaj

- [Pregled sistema](#pregled-sistema)
- [Instalacija](#instalacija)
  - [Preduslovi](#preduslovi)
  - [Struktura projekta](#struktura-projekta)
  - [Korak po korak instalacija](#korak-po-korak-instalacija)
- [Konfiguracija](#konfiguracija)
  - [.env fajl](#env-fajl)
  - [docker-compose.yml](#docker-composeyml)
- [Pokretanje servisa](#pokretanje-servisa)
  - [Inicijalno pokretanje](#inicijalno-pokretanje)
  - [Provera statusa](#provera-statusa)
- [Upravljanje sistemom](#upravljanje-sistemom)
  - [Zaustavljanje svih servisa](#zaustavljanje-svih-servisa)
  - [Ponovno pokretanje servisa](#ponovno-pokretanje-servisa)
  - [Rebuild i pokretanje određenog servisa](#rebuild-i-pokretanje-određenog-servisa)
  - [Brisanje i ponovno kreiranje kontejnera](#brisanje-i-ponovno-kreiranje-kontejnera)
- [Ručno pokretanje servisa](#ručno-pokretanje-servisa)
  - [Ručno pokretanje FTP sinhronizacije](#ručno-pokretanje-ftp-sinhronizacije)
  - [Ručna obrada postojećih slika](#ručna-obrada-postojećih-slika)
  - [Ručna obrada pojedinačne slike](#ručna-obrada-pojedinačne-slike)
- [Rešavanje problema](#rešavanje-problema)
  - [Problemi sa pristupom MinIO-u](#problemi-sa-pristupom-minio-u)
  - [Provera NAS montiranja](#provera-nas-montiranja)
  - [Problemi sa webhook notifikacijama](#problemi-sa-webhook-notifikacijama)
  - [Restartovanje servisa nakon izmena](#restartovanje-servisa-nakon-izmena)
- [Dodatne opcije](#dodatne-opcije)
  - [Automatsko montiranje NAS-a pri pokretanju](#automatsko-montiranje-nas-a-pri-pokretanju)
  - [Pristup MinIO bucket-u preko browser-a](#pristup-minio-bucket-u-preko-browser-a)
  - [Struktura organizacije slika](#struktura-organizacije-slika)
  - [Prilagođavanje veličina slika](#prilagođavanje-veličina-slika)
  - [Podešavanje rasporeda FTP sinhronizacije](#podešavanje-rasporeda-ftp-sinhronizacije)

## Pregled sistema

Sistem se sastoji od tri glavne komponente:

1. **MinIO Server** - S3-kompatibilni servis za skladištenje objekata koji čuva fotografije na NAS uređaju
2. **Image Resizer** - Servis koji automatski obrađuje slike, menja njihove veličine i konvertuje formate
3. **FTP Sync** - Servis koji automatski preuzima nove slike sa FTP servera i otprema ih na MinIO

Sve komponente su kontejnerizovane pomoću Docker-a i mogu se upravljati kroz Docker Compose.

## Instalacija

### Preduslovi

- Docker i Docker Compose
- Pristup NAS uređaju (npr. QNAP) preko mreže
- Najmanje 2GB slobodne RAM memorije
- Najmanje 10GB slobodnog prostora na disku

### Struktura projekta

```
minio-project/
├── docker-compose.yml      # Glavna konfiguracija
├── .env                    # Environment varijable
├── setup-notifications.sh  # Skripta za MinIO notifikacije
├── image-resizer/          # Servis za obradu slika
│   ├── Dockerfile
│   ├── package.json
│   ├── webhook-image-resize-service.js
│   └── temp/              # Privremeni folder
└── ftp-sync/              # Servis za FTP sinhronizaciju
    ├── Dockerfile
    ├── package.json
    ├── ftp-sync.js
    ├── direct-upload.js
    └── temp/              # Privremeni folder
```

### Korak po korak instalacija

1. Kreirajte osnovnu strukturu direktorijuma:

```bash
mkdir -p minio-project/{image-resizer,ftp-sync}/{temp}
cd minio-project
```

2. Montirajte NAS disk:

```bash
sudo mkdir -p /mnt/nas_storage
sudo mount -t cifs //192.168.100.9/s3_images /mnt/nas_storage -o username=YOUR_USERNAME,password=YOUR_PASSWORD,vers=2.0
```

3. Kreirajte potrebne fajlove:

```bash
touch docker-compose.yml .env setup-notifications.sh
touch image-resizer/{Dockerfile,package.json,webhook-image-resize-service.js}
touch ftp-sync/{Dockerfile,package.json,ftp-sync.js,direct-upload.js}
chmod +x setup-notifications.sh
```

4. Popunite fajlove odgovarajućim sadržajem (kopirajte iz odeljka [Konfiguracija](#konfiguracija) ili preuzmite priložene fajlove).

## Konfiguracija

### .env fajl

```properties
# MinIO kredencijali
MINIO_USER=admin
MINIO_PASSWORD=password123

# FTP konfiguracija
FTP_HOST=ftp.example.com
FTP_PORT=21
FTP_USER=username
FTP_PASSWORD=password
FTP_SECURE=false
FTP_REMOTE_PATH=/images

# FTP sinhronizacija - opciono
FTP_CRON_SCHEDULE=0 */1 * * *     # Svakog sata
FTP_LOOKBACK_HOURS=24             # Traži fajlove do 24h unazad
FTP_DELETE_AFTER_UPLOAD=false     # Da li brisati originale sa FTP-a
```

### docker-compose.yml

```yaml
version: '3'
services:
  minio:
    image: minio/minio:latest
    container_name: minio-s3
    network_mode: "host"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
      MINIO_DOMAIN: s3bkids.bebakids.com
      MINIO_SERVER_URL: https://s3bkids.bebakids.com
      MINIO_NOTIFY_WEBHOOK_ENABLE: "on"
      MINIO_NOTIFY_WEBHOOK_ENDPOINT: "http://localhost:3000/webhook"
    volumes:
      - /mnt/nas_storage:/data
    command: server --address ":9000" --console-address ":9001" /data
    restart: always
    
  image-resizer:
    build:
      context: ./image-resizer
      dockerfile: Dockerfile
    container_name: image-resizer
    network_mode: "host"
    environment:
      - MINIO_ENDPOINT=localhost
      - MINIO_PORT=9000
      - MINIO_ACCESS_KEY=${MINIO_USER}
      - MINIO_SECRET_KEY=${MINIO_PASSWORD}
      - BUCKET_NAME=products
    volumes:
      - ./image-resizer/temp:/usr/src/app/temp
    depends_on:
      - minio
    restart: always
    
  ftp-sync:
    build:
      context: ./ftp-sync
      dockerfile: Dockerfile
    container_name: ftp-sync
    network_mode: "host"
    environment:
      - FTP_HOST=${FTP_HOST}
      - FTP_PORT=${FTP_PORT}
      - FTP_USER=${FTP_USER}
      - FTP_PASSWORD=${FTP_PASSWORD}
      - FTP_SECURE=${FTP_SECURE}
      - FTP_REMOTE_PATH=${FTP_REMOTE_PATH}
      - MINIO_ENDPOINT=localhost
      - MINIO_PORT=9000
      - MINIO_ACCESS_KEY=${MINIO_USER}
      - MINIO_SECRET_KEY=${MINIO_PASSWORD}
      - MINIO_BUCKET=products
      - CRON_SCHEDULE=${FTP_CRON_SCHEDULE:-0 */1 * * *}
      - LOOKBACK_HOURS=${FTP_LOOKBACK_HOURS:-24}
      - DELETE_AFTER_UPLOAD=${FTP_DELETE_AFTER_UPLOAD:-false}
    volumes:
      - ./ftp-sync/temp:/app/temp
    depends_on:
      - minio
      - image-resizer
    restart: always
```

## Pokretanje servisa

### Inicijalno pokretanje

```bash
# Pokrenite sve servise
docker-compose up -d

# Sačekajte da se servisi pokrenu (oko 30 sekundi)
sleep 30

# Podesite MinIO notifikacije
./setup-notifications.sh
```

### Provera statusa

```bash
# Provera statusa svih servisa
docker-compose ps

# Provera logova MinIO servera
docker logs minio-s3

# Provera logova image-resizer servisa
docker logs image-resizer

# Provera logova ftp-sync servisa
docker logs ftp-sync
```

## Upravljanje sistemom

### Zaustavljanje svih servisa

```bash
docker-compose down
```

### Ponovno pokretanje servisa

```bash
docker-compose restart
```

### Rebuild i pokretanje određenog servisa

```bash
# Rebuild i restart image-resizer servisa
docker-compose up -d --build image-resizer

# Rebuild i restart ftp-sync servisa
docker-compose up -d --build ftp-sync

# Rebuild i restart svih servisa
docker-compose up -d --build
```

### Brisanje i ponovno kreiranje kontejnera

```bash
# Zaustavljanje i brisanje kontejnera
docker-compose down

# Uklanjanje volumena (opcionalno, uklanja skladištene podatke)
docker-compose down -v

# Brisanje specifičnog kontejnera
docker rm -f image-resizer

# Ponovno kreiranje i pokretanje
docker-compose up -d
```

## Ručno pokretanje servisa

### Ručno pokretanje FTP sinhronizacije

```bash
# Pokretanje jednokratne sinhronizacije bez čekanja na cronjob
docker exec -it ftp-sync node -e "require('./ftp-sync').syncFtpToMinio().catch(console.error)"
```

### Ručna obrada postojećih slika

```bash
# Pokretanje obrade svih postojećih slika u bucket-u
docker exec -it image-resizer node -e "require('./webhook-image-resize-service').processExistingImages('products').catch(console.error)"
```

### Ručna obrada pojedinačne slike

```bash
# Preko image-resizer API-ja
curl -X POST http://localhost:3000/resize -H "Content-Type: application/json" -d '{"bucket":"products","object":"251OM0M43B00.jpg"}'
```

## Rešavanje problema

### Problemi sa pristupom MinIO-u

```bash
# Provera da li MinIO server radi
curl -v http://localhost:9000
curl -v http://localhost:9001
```

### Provera NAS montiranja

```bash
# Provera da li je NAS pravilno montiran
ls -la /mnt/nas_storage

# Ponovno montiranje NAS-a ako je potrebno
sudo mount -t cifs //192.168.100.9/s3_images /mnt/nas_storage -o username=YOUR_USERNAME,password=YOUR_PASSWORD,vers=2.0
```

### Problemi sa webhook notifikacijama

```bash
# Ručno postvaljanje MinIO notifikacija
./setup-notifications.sh

# Provera da li webhook server odgovara
curl -v http://localhost:3000/health
```

### Restartovanje servisa nakon izmena

```bash
# Nakon izmena u konfiguraciji ili kodu
docker-compose up -d --build
```

## Dodatne opcije

### Automatsko montiranje NAS-a pri pokretanju

Dodajte u `/etc/fstab`:

```
//192.168.100.9/s3_images /mnt/nas_storage cifs username=YOUR_USERNAME,password=YOUR_PASSWORD,vers=2.0,_netdev 0 0
```

### Pristup MinIO bucket-u preko browser-a

- MinIO konzola: [http://localhost:9001](http://localhost:9001)
- Login: Koristi kredencijale iz .env fajla (MINIO_USER, MINIO_PASSWORD)

### Struktura organizacije slika

Za sliku kao što je `251OM0M43B00.jpg`, sistem će automatski kreirati:

```
251OM0M43B00/
├── thumb/
│   ├── 251OM0M43B00.webp
│   └── 251OM0M43B00.jpg
├── medium/
│   ├── 251OM0M43B00.webp
│   └── 251OM0M43B00.jpg
└── large/
    ├── 251OM0M43B00.webp
    └── 251OM0M43B00.jpg
```

### Prilagođavanje veličina slika

Modifikujte `resizeConfigs` u `image-resizer/webhook-image-resize-service.js`:

```javascript
const resizeConfigs = [
  { 
    suffix: 'thumbnail', 
    folder: 'thumb',
    width: 150 
  },
  { 
    suffix: 'medium', 
    folder: 'medium',
    width: 800 
  },
  { 
    suffix: 'large', 
    folder: 'large',
    width: 1200 
  }
];
```

### Podešavanje rasporeda FTP sinhronizacije

Prilagodite `FTP_CRON_SCHEDULE` u `.env` fajlu:

```
# Primeri CRON rasporeda
FTP_CRON_SCHEDULE=0 */1 * * *    # Svakog sata
FTP_CRON_SCHEDULE=0 */2 * * *    # Na svaka 2 sata
FTP_CRON_SCHEDULE=0 0 * * *      # Jednom dnevno u ponoć
FTP_CRON_SCHEDULE=0 8 * * 1-5    # Svakog radnog dana u 8 ujutru
```

---

## Licenca

MIT

## Podrška

Za dodatna pitanja ili prilagođavanja, kontaktirajte podršku.
