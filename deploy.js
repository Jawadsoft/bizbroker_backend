const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

async function deploy() {
  console.log('🚀 Starting deployment process...');
  
  try {
    // Step 1: Install dependencies
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
    
    // Step 2: Generate Prisma client
    console.log('🔧 Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    
    // Step 3: Test database connection
    console.log('🔍 Testing database connection...');
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful');
    
    // Step 4: Try migration approaches
    console.log('📋 Attempting database schema deployment...');
    
    try {
      // First try: migrate deploy
      console.log('🔄 Trying prisma migrate deploy...');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('✅ Migrations applied successfully');
    } catch (migrateError) {
      console.log('⚠️ Migrate deploy failed, trying db push...');
      try {
        // Second try: db push
        execSync('npx prisma db push', { stdio: 'inherit' });
        console.log('✅ Database schema pushed successfully');
      } catch (pushError) {
        console.error('❌ Both migration approaches failed');
        console.error('Migrate error:', migrateError.message);
        console.error('Push error:', pushError.message);
        throw new Error('Database deployment failed');
      }
    }
    
    // Step 5: Final Prisma client generation
    console.log('🔧 Final Prisma client generation...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    
    // Step 6: Verify tables exist
    console.log('🔍 Verifying database tables...');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'users'
    `;
    
    if (tables.length > 0) {
      console.log('✅ User table exists');
    } else {
      console.log('❌ User table not found');
      throw new Error('User table verification failed');
    }
    
    await prisma.$disconnect();
    console.log('🎉 Deployment preparation complete!');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deploy();
