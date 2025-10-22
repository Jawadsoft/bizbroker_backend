#!/bin/bash

# Render Deployment Script for Bizbroker Backend
# This script handles database migrations and ensures proper deployment

set -e  # Exit on any error

echo "🚀 Starting Render deployment process..."

# Step 1: Install dependencies
echo "📦 Installing dependencies..."
npm install

# Step 2: Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Step 3: Test database connection
echo "🔍 Testing database connection..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$queryRaw\`SELECT 1\`
  .then(() => {
    console.log('✅ Database connection successful');
    return prisma.\$disconnect();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  });
"

# Step 4: Database schema deployment
echo "📋 Deploying database schema..."

# Try migrate deploy first (preferred for production)
if npx prisma migrate deploy; then
  echo "✅ Migrations applied successfully"
else
  echo "⚠️ Migrate deploy failed, trying db push..."
  
  # Try db push as fallback
  if npx prisma db push; then
    echo "✅ Database schema pushed successfully"
  else
    echo "❌ Both migration approaches failed"
    echo "🔄 Attempting database reset and push..."
    
    # Last resort: reset and push
    if npx prisma migrate reset --force && npx prisma db push; then
      echo "✅ Database reset and push successful"
    else
      echo "❌ Database deployment failed completely"
      exit 1
    fi
  fi
fi

# Step 5: Final verification
echo "🔍 Verifying database tables..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyTables() {
  try {
    const tables = await prisma.\$queryRaw\`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'emails', 'tasks', 'notes', 'activities')
    \`;
    
    console.log('✅ Found tables:', tables.map(t => t.table_name).join(', '));
    
    if (tables.length >= 5) {
      console.log('✅ All required tables exist');
    } else {
      console.log('❌ Missing required tables');
      process.exit(1);
    }
    
    await prisma.\$disconnect();
  } catch (error) {
    console.error('❌ Table verification failed:', error);
    process.exit(1);
  }
}

verifyTables();
"

# Step 6: Final Prisma client generation
echo "🔧 Final Prisma client generation..."
npx prisma generate

echo "🎉 Deployment preparation complete!"
echo "🚀 Starting application..."

# Start the application
exec npm start
