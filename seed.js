import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const sampleProducts = [
  {
    name: "Premium Cotton T-Shirt",
    description: "High-quality cotton t-shirt perfect for casual wear. Soft, comfortable, and durable.",
    category: "Shirt",
    price: 25.99,
    quantity: 100,
    minimumOrder: 10,
    images: ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400"],
    paymentOptions: "Cash on Delivery",
    showOnHome: true,
    createdBy: "manager@test.com",
    createdAt: new Date()
  },
  {
    name: "Denim Jeans",
    description: "Classic blue denim jeans with modern fit. Perfect for everyday wear.",
    category: "Pant",
    price: 45.99,
    quantity: 75,
    minimumOrder: 5,
    images: ["https://images.unsplash.com/photo-1542272604-787c3835535d?w=400"],
    paymentOptions: "PayFast",
    showOnHome: true,
    createdBy: "manager@test.com",
    createdAt: new Date()
  },
  {
    name: "Winter Jacket",
    description: "Warm and stylish winter jacket. Water-resistant and windproof.",
    category: "Jacket",
    price: 89.99,
    quantity: 50,
    minimumOrder: 3,
    images: ["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400"],
    paymentOptions: "Cash on Delivery",
    showOnHome: true,
    createdBy: "manager@test.com",
    createdAt: new Date()
  },
  {
    name: "Leather Belt",
    description: "Genuine leather belt with metal buckle. Available in black and brown.",
    category: "Accessories",
    price: 19.99,
    quantity: 200,
    minimumOrder: 20,
    images: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400"],
    paymentOptions: "PayFast",
    showOnHome: true,
    createdBy: "manager@test.com",
    createdAt: new Date()
  },
  {
    name: "Formal Shirt",
    description: "Professional formal shirt for office wear. Wrinkle-free fabric.",
    category: "Shirt",
    price: 35.99,
    quantity: 80,
    minimumOrder: 8,
    images: ["https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400"],
    paymentOptions: "Cash on Delivery",
    showOnHome: true,
    createdBy: "manager@test.com",
    createdAt: new Date()
  },
  {
    name: "Cargo Pants",
    description: "Comfortable cargo pants with multiple pockets. Perfect for outdoor activities.",
    category: "Pant",
    price: 39.99,
    quantity: 60,
    minimumOrder: 6,
    images: ["https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400"],
    paymentOptions: "PayFast",
    showOnHome: true,
    createdBy: "manager@test.com",
    createdAt: new Date()
  }
];

async function seedProducts() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('garmentsTracker');
    const productsCollection = db.collection('products');
    
    // Clear existing products
    await productsCollection.deleteMany({});
    
    // Insert sample products
    const result = await productsCollection.insertMany(sampleProducts);
    console.log(`${result.insertedCount} products inserted successfully`);
    
  } catch (error) {
    console.error('Error seeding products:', error);
  } finally {
    await client.close();
  }
}

seedProducts();