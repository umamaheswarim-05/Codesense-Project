require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Database connection
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Test database connection
pool.connect()
  .then(() => console.log('PostgreSQL connected successfully'))
  .catch(err => console.error('Database connection error:', err.message));

// Routes
app.use('/api/auth', require('./routes/auth')(pool));
app.use('/api/execute', require('./routes/execute')(pool));
app.use('/api/dashboard', require('./routes/dashboard')(pool));

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'CodeSense Backend is running!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});