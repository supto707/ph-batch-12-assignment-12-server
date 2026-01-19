import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const whitelist = [
  'https://ph-batch-12-assignment-12-client.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (whitelist.indexOf(origin) !== -1 || origin.startsWith('http://localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
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
    const {
      search,
      category,
      minPrice,
      maxPrice,
      minRating,
      sortField = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 8
    } = req.query;

    let query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (category) query.category = category;

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    if (minRating) {
      query.rating = { $gte: parseFloat(minRating) };
    }

    const db = client.db('garmentsTracker');
    const collection = db.collection('products');

    const totalProducts = await collection.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    const products = await collection.find(query)
      .sort({ [sortField]: sortOrder === 'desc' ? -1 : 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .toArray();

    res.json({
      products,
      totalProducts,
      totalPages,
      currentPage: parseInt(page)
    });
  } catch (error) {
    res.json({ products: [], totalProducts: 0, totalPages: 0, currentPage: 1 });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    const token = jwt.sign({ email }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
    res.cookie('token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    }).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    await client.connect();
    const { email, ...userData } = req.body;
    const db = client.db('garmentsTracker');

    // Check if user exists to preserve role if already set
    const existingUser = await db.collection('users').findOne({ email });

    const user = {
      ...userData,
      email,
      role: existingUser?.role || userData.role || 'buyer',
      status: existingUser?.status || 'approved',
      updatedAt: new Date()
    };

    if (!existingUser) {
      user.createdAt = new Date();
    }

    const result = await db.collection('users').updateOne(
      { email },
      { $set: user },
      { upsert: true }
    );
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    await client.connect();
    const users = await client.db('garmentsTracker').collection('users').find({}).toArray();
    res.json(users);
  } catch (error) {
    res.json([]);
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    await client.connect();
    const result = await client.db('garmentsTracker').collection('users').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    await client.connect();
    const product = await client.db('garmentsTracker').collection('products').findOne({ _id: new ObjectId(req.params.id) });
    res.json(product);
  } catch (error) {
    res.json(null);
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    await client.connect();
    const orders = await client.db('garmentsTracker').collection('orders').find({}).toArray();
    res.json(orders);
  } catch (error) {
    res.json([]);
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    await client.connect();
    const db = client.db('garmentsTracker');

    const totalUsers = await db.collection('users').countDocuments();
    const totalProducts = await db.collection('products').countDocuments();
    const totalOrders = await db.collection('orders').countDocuments();

    // Monthly User Growth
    const userGrowth = await db.collection('users').aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { month: "$_id", count: 1, _id: 0 } }
    ]).toArray();

    // Category Distribution
    const categoryStats = await db.collection('products').aggregate([
      {
        $group: {
          _id: "$category",
          value: { $sum: 1 }
        }
      },
      { $project: { name: "$_id", value: 1, _id: 0 } }
    ]).toArray();

    // Sales Stats (Revenue per month)
    const salesStats = await db.collection('orders').aggregate([
      { $match: { status: 'approved' } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          revenue: { $sum: "$total" }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { month: "$_id", revenue: 1, _id: 0 } }
    ]).toArray();

    const revenueResult = await db.collection('orders').aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]).toArray();

    res.json({
      totalUsers,
      totalProducts,
      totalOrders,
      revenue: revenueResult[0]?.total || 0,
      userGrowth: userGrowth.length > 0 ? userGrowth : [{ month: '2024-01', count: 0 }],
      categoryStats: categoryStats.length > 0 ? categoryStats : [{ name: 'None', value: 0 }],
      salesStats: salesStats.length > 0 ? salesStats : [{ month: '2024-01', revenue: 0 }]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    await client.connect();
    const db = client.db('garmentsTracker');

    // 1. Check stock
    const product = await db.collection('products').findOne({ _id: new ObjectId(productId) });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    // 2. Create order
    const order = {
      ...req.body,
      status: 'pending',
      createdAt: new Date()
    };
    const orderResult = await db.collection('orders').insertOne(order);

    // 3. Decrement stock
    await db.collection('products').updateOne(
      { _id: new ObjectId(productId) },
      { $inc: { quantity: -parseInt(quantity) } }
    );

    res.json(orderResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/orders/:id', async (req, res) => {
  try {
    await client.connect();
    const db = client.db('garmentsTracker');
    const orderId = new ObjectId(req.params.id);
    const updates = req.body;

    // If cancelling, restore stock
    if (updates.status === 'cancelled') {
      const order = await db.collection('orders').findOne({ _id: orderId });
      if (order && order.status !== 'cancelled') {
        await db.collection('products').updateOne(
          { _id: new ObjectId(order.productId) },
          { $inc: { quantity: parseInt(order.quantity) } }
        );
      }
    }

    const result = await db.collection('orders').updateOne(
      { _id: orderId },
      { $set: updates }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    await client.connect();
    const order = await client.db('garmentsTracker').collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    res.json(order);
  } catch (error) {
    res.json(null);
  }
});

app.post('/api/products', async (req, res) => {
  try {
    await client.connect();
    const product = { ...req.body, createdAt: new Date() };
    const result = await client.db('garmentsTracker').collection('products').insertOne(product);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/products/:id', async (req, res) => {
  try {
    await client.connect();
    const result = await client.db('garmentsTracker').collection('products').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await client.connect();
    const result = await client.db('garmentsTracker').collection('products').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/me', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    await client.connect();
    const user = await client.db('garmentsTracker').collection('users').findOne({ email: decoded.email });
    res.json(user);
  } catch (error) {
    res.status(401).json({ message: 'Unauthorized' });
  }
});

// Seed data on startup
client.connect().then(async () => {
  const db = client.db('garmentsTracker');

  // Clear and seed users
  await db.collection('users').deleteMany({});
  await db.collection('users').insertMany([
    { name: "Admin User", email: "admin123@gmail.com", role: "admin", status: "approved", createdAt: new Date() },
    { name: "Manager User", email: "manager123@gmail.com", role: "manager", status: "approved", createdAt: new Date() },
    { name: "Buyer User", email: "buyer123@gmail.com", role: "buyer", status: "approved", createdAt: new Date() }
  ]);

  // Clear and seed products
  await db.collection('products').deleteMany({});
  await db.collection('products').insertMany([
    { name: "Premium Cotton T-Shirt", description: "High-quality cotton t-shirt", category: "Shirt", price: 25.99, quantity: 100, rating: 4.8, location: "Dhaka, BD", images: ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400"], showOnHome: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1) },
    { name: "Denim Jeans", description: "Classic blue denim jeans", category: "Pant", price: 45.99, quantity: 75, rating: 4.5, location: "Gazipur, BD", images: ["https://images.unsplash.com/photo-1542272604-787c3835535d?w=400"], showOnHome: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2) },
    { name: "Winter Jacket", description: "Warm winter jacket", category: "Jacket", price: 89.99, quantity: 50, rating: 4.9, location: "Chattogram, BD", images: ["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400"], showOnHome: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3) },
    { name: "Formal Shirt", description: "Professional formal shirt", category: "Shirt", price: 35.99, quantity: 80, rating: 4.6, location: "Dhaka, BD", images: ["https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400"], showOnHome: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4) },
    { name: "Cargo Pants", description: "Comfortable cargo pants", category: "Pant", price: 39.99, quantity: 60, rating: 4.3, location: "Narayanganj, BD", images: ["https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400"], showOnHome: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5) },
    { name: "Leather Belt", description: "Genuine leather belt", category: "Accessories", price: 19.99, quantity: 200, rating: 4.7, location: "Rajshahi, BD", images: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400"], showOnHome: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6) },
    { name: "Polo Shirt", description: "Classic polo shirt", category: "Shirt", price: 28.99, quantity: 90, rating: 4.4, location: "Dhaka, BD", images: ["https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) },
    { name: "Chino Pants", description: "Stylish chino pants", category: "Pant", price: 42.99, quantity: 70, rating: 4.1, location: "Cumilla, BD", images: ["https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8) },
    { name: "Hoodie", description: "Comfortable hoodie", category: "Jacket", price: 55.99, quantity: 65, rating: 4.7, location: "Sylhet, BD", images: ["https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9) },
    { name: "Baseball Cap", description: "Adjustable baseball cap", category: "Accessories", price: 15.99, quantity: 150, rating: 4.2, location: "Dhaka, BD", images: ["https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10) },
    { name: "V-Neck Sweater", description: "Warm v-neck sweater", category: "Jacket", price: 65.99, quantity: 45, rating: 4.6, location: "Chattogram, BD", images: ["https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 11) },
    { name: "Skinny Jeans", description: "Trendy skinny jeans", category: "Pant", price: 48.99, quantity: 85, rating: 4.8, location: "Dhaka, BD", images: ["https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12) },
    { name: "Button-Down Shirt", description: "Classic button-down shirt", category: "Shirt", price: 32.99, quantity: 95, rating: 4.5, location: "Gazipur, BD", images: ["https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 13) },
    { name: "Track Pants", description: "Athletic track pants", category: "Pant", price: 36.99, quantity: 110, rating: 4.3, location: "Dhaka, BD", images: ["https://images.unsplash.com/photo-1506629905607-d9c8e3b8c6b4?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14) },
    { name: "Bomber Jacket", description: "Stylish bomber jacket", category: "Jacket", price: 78.99, quantity: 40, rating: 4.9, location: "Chattogram, BD", images: ["https://images.unsplash.com/photo-1544966503-7cc5ac882d5f?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15) },
    { name: "Leather Wallet", description: "Premium leather wallet", category: "Accessories", price: 24.99, quantity: 180, rating: 4.6, location: "Dhaka, BD", images: ["https://images.unsplash.com/photo-1627123424574-724758594e93?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 16) },
    { name: "Henley Shirt", description: "Casual henley shirt", category: "Shirt", price: 29.99, quantity: 75, rating: 4.4, location: "Sylhet, BD", images: ["https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 17) },
    { name: "Shorts", description: "Summer shorts", category: "Pant", price: 22.99, quantity: 120, rating: 4.1, location: "Dhaka, BD", images: ["https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 18) },
    { name: "Cardigan", description: "Cozy cardigan", category: "Jacket", price: 58.99, quantity: 55, rating: 4.7, location: "Dhaka, BD", images: ["https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 19) },
    { name: "Sunglasses", description: "Stylish sunglasses", category: "Accessories", price: 18.99, quantity: 160, rating: 4.2, location: "Chattogram, BD", images: ["https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20) },
    { name: "Tank Top", description: "Comfortable tank top", category: "Shirt", price: 16.99, quantity: 130, rating: 4.3, location: "Gazipur, BD", images: ["https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400"], showOnHome: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 21) }
  ]);

  console.log('Products seeded');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});