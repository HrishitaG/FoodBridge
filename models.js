const { DataTypes } = require('sequelize');
const { sequelize } = require('./db');

const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, defaultValue: null },
    role: { type: DataTypes.ENUM('donor', 'receiver'), allowNull: false },
    location: { type: DataTypes.STRING, defaultValue: '' },
    isVerified: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { timestamps: true });

const Listing = sequelize.define('Listing', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    donorId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.STRING, allowNull: false },
    price: { type: DataTypes.FLOAT, defaultValue: 0 },
    type: { type: DataTypes.ENUM('free', 'paid'), defaultValue: 'free' },
    category: { type: DataTypes.STRING, defaultValue: 'other' },
    location: { type: DataTypes.STRING, allowNull: false },
    expiryTime: { type: DataTypes.DATE, allowNull: false },
    description: { type: DataTypes.TEXT, defaultValue: '' },
    image: { type: DataTypes.TEXT, defaultValue: null },
    status: { type: DataTypes.ENUM('active', 'completed', 'expired'), defaultValue: 'active' }
}, { timestamps: true });

const Order = sequelize.define('Order', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    listingId: { type: DataTypes.INTEGER, allowNull: false },
    receiverId: { type: DataTypes.INTEGER, allowNull: false },
    donorId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'approved', 'verified', 'completed', 'rejected'), defaultValue: 'pending' },
    amount: { type: DataTypes.FLOAT, defaultValue: 0 },
    otp: { type: DataTypes.STRING },
    otpExpiry: { type: DataTypes.DATE }
}, { timestamps: true });

// Associations
User.hasMany(Listing, { foreignKey: 'donorId' });
Listing.belongsTo(User, { foreignKey: 'donorId', as: 'donor' });

Listing.hasMany(Order, { foreignKey: 'listingId' });
Order.belongsTo(Listing, { foreignKey: 'listingId', as: 'listing' });

User.hasMany(Order, { foreignKey: 'receiverId' });
Order.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

User.hasMany(Order, { foreignKey: 'donorId' });
Order.belongsTo(User, { foreignKey: 'donorId', as: 'donor' });

module.exports = { User, Listing, Order };
