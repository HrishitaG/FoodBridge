const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false
});

const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ SQLite connected successfully!');
    } catch (error) {
        console.error('❌ SQLite connection error:', error.message);
        process.exit(1);
    }
};

module.exports = { sequelize, connectDB };
