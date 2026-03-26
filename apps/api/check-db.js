const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '.env') });

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('Checking database connection...');
    
    // 检查用户表
    console.log('\n=== Users ===');
    const users = await prisma.user.findMany();
    console.log(`Found ${users.length} users:`);
    users.forEach(user => {
      console.log(`- ID: ${user.id}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Username: ${user.username}`);
      console.log(`  Created At: ${user.createdAt}`);
      console.log('');
    });
    
    // 检查刷新令牌表
    console.log('\n=== Refresh Tokens ===');
    const refreshTokens = await prisma.refreshToken.findMany({
      include: { user: true }
    });
    console.log(`Found ${refreshTokens.length} refresh tokens:`);
    refreshTokens.forEach(token => {
      console.log(`- ID: ${token.id}`);
      console.log(`  User ID: ${token.userId}`);
      console.log(`  User Email: ${token.user.email}`);
      console.log(`  Expires At: ${token.expiresAt}`);
      console.log(`  Revoked At: ${token.revokedAt}`);
      console.log('');
    });
    
    // 检查帖子表
    console.log('\n=== Posts ===');
    const posts = await prisma.post.findMany({
      include: { author: true }
    });
    console.log(`Found ${posts.length} posts:`);
    posts.forEach(post => {
      console.log(`- ID: ${post.id}`);
      console.log(`  Author: ${post.author.username} (${post.author.email})`);
      console.log(`  Content: ${post.content.substring(0, 50)}${post.content.length > 50 ? '...' : ''}`);
      console.log(`  Created At: ${post.createdAt}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
