import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(cookieParser());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Simple routes that work
app.get('/', (req, res) => {
  res.json({ message: 'Server running' });
});

app.get('/api/products/home', async (req, res) => {
  try {
    await client.connect();
    const products = await client.db('garmentsTracker').collection('products').find({}).limit(6).toArray();
    res.json(products);
  } catch (error) {
    res.json([]);
  }
});

app.get('/api/products', async (req, res) => {
  try {
    await client.connect();
    const products = await client.db('garmentsTracker').collection('products').find({}).toArray();
    res.json(products);
  } catch (error) {
    res.json([]);
  }
});

// Seed data on startup
client.connect().then(async () => {
  const db = client.db('garmentsTracker');
  
  // Clear and seed products
  await db.collection('products').deleteMany({});
  await db.collection('products').insertMany([
    {
      name: "Premium Cotton T-Shirt",
      description: "High-quality cotton t-shirt",
      category: "Shirt",
      price: 25.99,
      quantity: 100,
      images: ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400"],
      showOnHome: true
    },
    {
      name: "Denim Jeans",
      description: "Classic blue denim jeans",
      category: "Pant", 
      price: 45.99,
      quantity: 75,
      images: ["https://images.unsplash.com/photo-1542272604-787c3835535d?w=400"],
      showOnHome: true
    },
    {
      name: "Winter Jacket",
      description: "Warm winter jacket",
      category: "Jacket",
      price: 89.99,
      quantity: 50,
      images: ["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400"],
      showOnHome: true
    }
  ]);
  
  console.log('Products seeded');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});