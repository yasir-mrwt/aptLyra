# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies (including devDependencies)
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built files from the builder stage
COPY --from=builder /app/dist ./dist

# Create uploads directory (used by the application)
RUN mkdir -p uploads/resumes

# Expose port (Render sets the PORT environment variable)
EXPOSE 5000

# Start the Node.js server
CMD ["npm", "start"]
