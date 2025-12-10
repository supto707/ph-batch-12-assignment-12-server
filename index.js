import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
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

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: 'Unauthorized' });
    req.user = decoded;
    next();
  });
};

const verifyAdmin = async (req, res, next) => {
  const email = req.user.email;
  const user = await client.db('garmentsTracker').collection('users').findOne({ email });
  if (user?.role !== 'admin') return res.status(403).send({ message: 'Forbidden' });
  next();
};

const verifyManager = async (req, res, next) => {
  const email = req.user.email;
  const user = await client.db('garmentsTracker').collection('users').findOne({ email });
  if (user?.role !== 'manager' || user?.status === 'suspended') {
    return res.status(403).send({ message: 'Forbidden' });
  }
  next();
};

async function run() {
  try {
    await client.connect();
    const db = client.db('garmentsTracker');
    const usersCollection = db.collection('users');
    const productsCollection = db.collection('products');
    const ordersCollection = db.collection('orders');

    // Auth Routes
    app.post('/api/auth/register', async (req, res) => {
      const user = req.body;
      const exists = await usersCollection.findOne({ email: user.email });
      if (exists) return res.status(400).send({ message: 'User already exists' });
      
      const newUser = {
        ...user,
        status: user.role === 'admin' ? 'approved' : 'pending',
        createdAt: new Date()
      };
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    app.post('/api/auth/login', async (req, res) => {
      const { email } = req.body;
      const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      }).send({ success: true });
    });

    app.post('/api/auth/logout', (req, res) => {
      res.clearCookie('token').send({ success: true });
    });

    app.get('/api/users/me', verifyToken, async (req, res) => {
      const user = await usersCollection.findOne({ email: req.user.email });
      res.send(user);
    });

    // User Management
    app.get('/api/users', verifyToken, verifyAdmin, async (req, res) => {
      const { search } = req.query;
      const query = search ? { $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]} : {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    app.patch('/api/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const update = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: update }
      );
      res.send(result);
    });

    app.get('/api/products', async (req, res) => {
      try {
        const { limit, category, search } = req.query;
        let query = {};
        if (category) query.category = category;
        if (search) query.name = { $regex: search, $options: 'i' };
        
        const products = await productsCollection
          .find(query)
          .limit(limit ? parseInt(limit) : 0)
          .toArray();
        res.json(products);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/products/home', async (req, res) => {
      try {
        const products = await productsCollection
          .find({})
          .limit(6)
          .toArray();
        res.json(products);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/products/:id', async (req, res) => {
      const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
      res.send(product);
    });

    app.post('/api/products', verifyToken, verifyManager, async (req, res) => {
      const product = {
        ...req.body,
        createdBy: req.user.email,
        createdAt: new Date()
      };
      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    app.patch('/api/products/:id', verifyToken, async (req, res) => {
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );
      res.send(result);
    });

    app.delete('/api/products/:id', verifyToken, async (req, res) => {
      const result = await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // Orders
    app.post('/api/orders', verifyToken, async (req, res) => {
      const order = {
        ...req.body,
        userEmail: req.user.email,
        status: 'pending',
        createdAt: new Date()
      };
      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    app.get('/api/orders', verifyToken, async (req, res) => {
      const { status, userEmail } = req.query;
      let query = {};
      if (status) query.status = status;
      if (userEmail) query.userEmail = userEmail;
      
      const orders = await ordersCollection.find(query).toArray();
      res.send(orders);
    });

    app.get('/api/orders/:id', verifyToken, async (req, res) => {
      const order = await ordersCollection.findOne({ _id: new ObjectId(req.params.id) });
      res.send(order);
    });

    app.patch('/api/orders/:id', verifyToken, async (req, res) => {
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: req.body }
      );
      res.send(result);
    });

    app.patch('/api/orders/:id/tracking', verifyToken, verifyManager, async (req, res) => {
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $push: { tracking: req.body } }
      );
      res.send(result);
    });

    // Force seed users
    await usersCollection.deleteMany({});
    const sampleUsers = [
      {
        name: "Admin User",
        email: "admin@test.com",
        role: "admin",
        status: "approved",
        createdAt: new Date()
      },
      {
        name: "Manager User",
        email: "manager@test.com",
        role: "manager",
        status: "approved",
        createdAt: new Date()
      },
      {
        name: "Buyer User",
        email: "buyer@test.com",
        role: "buyer",
        status: "approved",
        createdAt: new Date()
      }
    ];
    await usersCollection.insertMany(sampleUsers);
    console.log('Users force seeded');

    // Force seed products
    await productsCollection.deleteMany({});
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
      }
    ];
    await productsCollection.insertMany(sampleProducts);
    console.log('Products force seeded');

    console.log('Connected to MongoDB!');
  } catch (error) {
    console.error(error);
  }
}

run();

app.get('/', (req, res) => {
  res.send('Garments Tracker Server Running');
});

app.get('/test', (req, res) => {
  res.json({ message: 'Server working', timestamp: new Date() });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'API working', timestamp: new Date() });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
