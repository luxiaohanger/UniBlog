const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '.env') });

const prisma = new PrismaClient();

async function resetPassword() {
  try {
    console.log('Resetting admin password...');
    
    // 定义新密码
    const newPassword = 'admin123';
    
    // 哈希密码
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // 更新 admin 用户的密码
    const updatedUser = await prisma.user.update({
      where: { username: 'admin' },
      data: { passwordHash }
    });
    
    console.log(`Successfully reset password for user: ${updatedUser.username}`);
    console.log(`New password: ${newPassword}`);
    
  } catch (error) {
    console.error('Error resetting password:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
