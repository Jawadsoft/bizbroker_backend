# 🔧 Database Migration Troubleshooting Guide

## 🚨 Current Issue: "No migration found in prisma/migrations"

The error indicates that Prisma migrations are not being applied during deployment. Here's how to fix it:

## 🛠️ Immediate Solutions

### Solution 1: Manual Migration (Recommended)

1. **Connect to your Render PostgreSQL database**:
   - Go to your Render dashboard
   - Click on your PostgreSQL service
   - Copy the **External Database URL**

2. **Run migrations locally**:
   ```bash
   # Set your DATABASE_URL to the Render database
   export DATABASE_URL="postgresql://username:password@host:port/database"
   
   # Run migrations
   npx prisma migrate deploy
   
   # Verify tables were created
   npx prisma db pull --print
   ```

3. **Redeploy your service**:
   - Push your changes to GitHub
   - Render will automatically redeploy

### Solution 2: Reset and Recreate Database

If the above doesn't work:

1. **Delete and recreate your PostgreSQL service**:
   - Go to Render dashboard
   - Delete your current PostgreSQL service
   - Create a new one with the same name

2. **Redeploy your web service**:
   - The new deployment will run migrations on the fresh database

### Solution 3: Use Prisma Push (Alternative)

If migrations continue to fail, you can use `prisma db push` instead:

1. **Update your build command** in `render.yaml`:
   ```yaml
   buildCommand: npm install && npx prisma generate && npx prisma db push
   ```

2. **Or update package.json**:
   ```json
   "deploy": "npm install && npx prisma generate && npx prisma db push"
   ```

## 🔍 Debugging Steps

### 1. Check Migration Files
Verify your migration files exist:
```bash
ls -la prisma/migrations/
```

You should see folders like:
- `20250615135316_init/`
- `20250714204127_appointment/`
- etc.

### 2. Check Migration Status
```bash
npx prisma migrate status
```

### 3. Check Database Connection
```bash
npx prisma db pull --print
```

### 4. Verify Environment Variables
Make sure `DATABASE_URL` is correctly set in Render:
- Use the **Internal Database URL** (not External)
- Format: `postgresql://username:password@host:port/database`

## 📋 Updated Deployment Process

### Step 1: Fix Local Migrations
```bash
# Make sure migrations are up to date locally
npx prisma migrate dev

# Commit and push changes
git add .
git commit -m "Fix database migrations"
git push origin main
```

### Step 2: Update Render Configuration
Your `render.yaml` now uses:
```yaml
buildCommand: npm run deploy
```

Which runs:
```bash
npm install && npx prisma generate && npx prisma migrate deploy && npx prisma generate
```

### Step 3: Monitor Deployment
1. Go to your Render service dashboard
2. Click **"Logs"** tab
3. Watch for migration output
4. Look for any errors

### Step 4: Verify Health Check
Visit: `https://your-service.onrender.com/health`

Look for:
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "users_table_exists": true,
    "email_sending": "configured",
    "email_receiving": "active"
  }
}
```

## 🚨 Emergency Fix

If nothing else works, try this emergency approach:

### 1. Create a Migration Reset Script
Create `reset-db.js`:
```javascript
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

async function resetDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Resetting database...');
    
    // Drop all tables
    await prisma.$executeRaw`DROP SCHEMA public CASCADE`;
    await prisma.$executeRaw`CREATE SCHEMA public`;
    
    console.log('✅ Database reset complete');
    
    // Run migrations
    console.log('🔄 Running migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    
    console.log('✅ Migrations applied');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetDatabase();
```

### 2. Add to package.json:
```json
"scripts": {
  "db:reset": "node reset-db.js"
}
```

### 3. Update build command:
```yaml
buildCommand: npm install && npx prisma generate && npm run db:reset
```

## ✅ Verification Checklist

After fixing, verify:

- [ ] `/health` endpoint shows `users_table_exists: true`
- [ ] No errors in Render logs
- [ ] Email service starts without errors
- [ ] All API endpoints work
- [ ] Database contains all expected tables

## 🆘 Still Having Issues?

If you're still experiencing problems:

1. **Check Render Logs**: Look for specific error messages
2. **Verify DATABASE_URL**: Make sure it's the Internal URL
3. **Check Migration Files**: Ensure they exist in your repo
4. **Contact Support**: Render has excellent support

## 📞 Quick Commands Reference

```bash
# Check migration status
npx prisma migrate status

# Apply migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate

# Check database connection
npx prisma db pull --print

# Reset database (DANGER: deletes all data)
npx prisma migrate reset
```

---

**Remember**: Always backup your data before running destructive commands!

