#!/bin/bash

# Comprehensive deployment script for Render
# This handles the migration issue by using multiple approaches

echo "🚀 Starting comprehensive deployment process..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client first
echo "🔧 Generating Prisma client..."
npx prisma generate

# Check database connection
echo "🔍 Testing database connection..."
if npx prisma db pull --print > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Try to get migration status
echo "📋 Checking migration status..."
if npx prisma migrate status > /dev/null 2>&1; then
    echo "📊 Migration status available, attempting migrate deploy..."
    if npx prisma migrate deploy; then
        echo "✅ Migrations applied successfully"
    else
        echo "⚠️ Migrate deploy failed, trying db push..."
        if npx prisma db push; then
            echo "✅ Database schema pushed successfully"
        else
            echo "❌ Both migration approaches failed"
            exit 1
        fi
    fi
else
    echo "⚠️ No migration history found, using db push..."
    if npx prisma db push; then
        echo "✅ Database schema pushed successfully"
    else
        echo "❌ Database push failed"
        exit 1
    fi
fi

# Final Prisma client generation
echo "🔧 Final Prisma client generation..."
npx prisma generate

# Verify tables exist
echo "🔍 Verifying database tables..."
if npx prisma db pull --print | grep -q "model User"; then
    echo "✅ User table exists"
else
    echo "❌ User table not found"
    exit 1
fi

echo "🎉 Deployment preparation complete!"
