#!/bin/bash

# Deployment script for Render
# This script ensures proper database setup and migration

echo "🚀 Starting deployment process..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Check if database is accessible
echo "🔍 Checking database connection..."
npx prisma db pull --print

# Apply migrations
echo "🗄️ Applying database migrations..."
npx prisma migrate deploy

# Verify migration status
echo "✅ Verifying migration status..."
npx prisma migrate status

# Generate Prisma client again after migrations
echo "🔧 Regenerating Prisma client..."
npx prisma generate

echo "🎉 Deployment preparation complete!"
