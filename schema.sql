CREATE DATABASE IF NOT EXISTS foodbridge;
USE foodbridge;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('donor', 'receiver') NOT NULL,
    location VARCHAR(255),
    isVerified BOOLEAN DEFAULT FALSE,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Listings table
CREATE TABLE IF NOT EXISTS listings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    donorId INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    quantity VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    type ENUM('free', 'paid') DEFAULT 'free',
    category VARCHAR(100),
    location VARCHAR(255) NOT NULL,
    expiryTime DATETIME NOT NULL,
    description TEXT,
    image MEDIUMTEXT,
    status ENUM('active', 'completed', 'expired') DEFAULT 'active',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (donorId) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Orders/Requests table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    listingId INT NOT NULL,
    receiverId INT NOT NULL,
    donorId INT NOT NULL,
    status ENUM('pending', 'verified', 'completed', 'rejected') DEFAULT 'pending',
    amount DECIMAL(10, 2) DEFAULT 0.00,
    otp VARCHAR(6),
    otpExpiry DATETIME,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listingId) REFERENCES listings(id) ON DELETE CASCADE,
    FOREIGN KEY (receiverId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (donorId) REFERENCES users(id) ON DELETE CASCADE
);
