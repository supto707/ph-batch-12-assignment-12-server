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
  origin: [process.env.CLIENT_URL || 'http://localhost:5173'],
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

    // Products
    app.get('/api/products', async (req, res) => {
      const { limit, category, search } = req.query;
      let query = {};
      if (category) query.category = category;
      if (search) query.name = { $regex: search, $options: 'i' };
      
      const products = await productsCollection
        .find(query)
        .limit(limit ? parseInt(limit) : 0)
        .toArray();
      res.send(products);
    });

    app.get('/api/products/home', async (req, res) => {
      const products = await productsCollection
        .find({ showOnHome: true })
        .limit(6)
        .toArray();
      res.send(products);
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

    console.log('Connected to MongoDB!');
  } catch (error) {
    console.error(error);
  }
}

run();

app.get('/', (req, res) => {
  res.send('Garments Tracker Server Running');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
