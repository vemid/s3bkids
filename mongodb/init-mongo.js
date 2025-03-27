
// init-mongo.js
// Inicijalizacija MongoDB baze podataka s odgovarajućim kredencijalima

print("Započinjem inicijalizaciju MongoDB baze podataka...");

// Kreiranje productgallery baze
db = db.getSiblingDB('productgallery');

// Kreiranje kolekcija
db.createCollection('users');
db.createCollection('products');
db.createCollection('seasons');

print("Kolekcije kreirane: users, products, seasons");

// Kreiranje indeksa
db.users.createIndex({ "username": 1 }, { unique: true });
db.users.createIndex({ "email": 1 }, { unique: true });
db.products.createIndex({ "sku": 1 }, { unique: true });
db.seasons.createIndex({ "prefix": 1 }, { unique: true });

print("Indeksi kreirani");

// Provjera postoji li admin korisnik
const adminUserExists = db.users.countDocuments({ username: 'admin' }) > 0;

if (!adminUserExists) {
  // Kreiranje admin korisnika
  const adminUser = {
    username: 'admin',
    password: '$2b$10$pRfj3KBh/xN8QJnGvIOm4e/TF3IGcq2QzBb8QVK8G3CXqrfQTSude', // bcrypt hash za Admin710412!
    email: 'admin@bebakids.com',
    role: 'admin',
    createdAt: new Date(),
    lastLogin: null
  };

  db.users.insertOne(adminUser);
  print('Admin korisnik kreiran s korisničkim imenom "admin"');
}

// Dodavanje sezona ako ne postoje
const seasons = [
  {
    prefix: "125",
    seasonName: "Proleće Leto 2025",
    displayOrder: 1,
    active: true
  },
  {
    prefix: "624",
    seasonName: "Jesen Zima 2024",
    displayOrder: 2,
    active: true
  }
];

seasons.forEach(season => {
  const seasonExists = db.seasons.countDocuments({ prefix: season.prefix }) > 0;

  if (!seasonExists) {
    db.seasons.insertOne({
      ...season,
      createdAt: new Date()
    });
    print(`Sezona ${season.prefix} kreirana`);
  }
});

print('Inicijalizacija MongoDB baze podataka uspješno završena.');