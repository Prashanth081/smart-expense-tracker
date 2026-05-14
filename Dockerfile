# Use a full Node.js image to ensure all build tools are available
FROM node:20

# Install Python and Pip
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv build-essential

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node dependencies and force build from source for sqlite3
RUN npm install --build-from-source

# Copy requirements.txt and install Python dependencies
COPY requirements.txt ./
RUN python3 -m pip install --no-cache-dir -r requirements.txt --break-system-packages

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
