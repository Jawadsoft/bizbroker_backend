# 🗄️ Database Inspector

A comprehensive web-based tool to monitor and inspect your Bizbroker PostgreSQL database, similar to the [vehicle management database inspector](https://vehicle-management-backend-ypsa.onrender.com/test-inspect.html?4545454).

## 🚀 Features

### 📊 Database Monitoring
- **Health Status**: Real-time database connection and health monitoring
- **Statistics**: Live counts of users, emails, tasks, notes, and other entities
- **Table List**: View all database tables with quick actions

### 🔍 Data Inspection
- **Table Data Viewer**: Browse data from any table with customizable row limits
- **SQL Query Interface**: Execute custom SELECT queries safely
- **Sample Queries**: Pre-built queries for common operations
- **Table Structure**: View column definitions and data types

### 🛠️ Database Management
- **Test Data Creation**: Generate sample data for testing
- **Data Reset**: Clear all data while preserving table structure
- **Database Reset**: Complete database recreation (development only)

## 🌐 Access URLs

After deployment, access the database inspector at:

- **Primary**: `https://bizbroker-backend.onrender.com/database-inspector`
- **Alternative**: `https://bizbroker-backend.onrender.com/db-inspector`

## 🔧 API Endpoints

The inspector uses these backend API endpoints:

- `GET /api/db/tables` - List all database tables
- `POST /api/db/query` - Execute SQL queries (SELECT only)
- `GET /api/db/stats` - Get database statistics
- `POST /api/db/test-data` - Create test data
- `POST /api/db/reset` - Reset database (dev only)
- `POST /api/db/delete-all` - Delete all data
- `GET /api/db/table-structure/:tableName` - Get table structure

## 🛡️ Security Features

- **Query Restrictions**: Only SELECT, WITH, SHOW, DESCRIBE, and EXPLAIN queries allowed
- **Production Safety**: Database reset disabled in production
- **CORS Protection**: Properly configured for your frontend domain
- **Input Validation**: All queries are validated before execution

## 📋 Sample Queries

### Users
```sql
-- View all users
SELECT * FROM users LIMIT 10;

-- Count users by role
SELECT role, COUNT(*) as count FROM users GROUP BY role;

-- Get active users
SELECT * FROM users WHERE status = 'ACTIVE';
```

### Emails
```sql
-- Recent emails
SELECT * FROM emails ORDER BY sentAt DESC LIMIT 10;

-- Email statistics
SELECT direction, COUNT(*) as count FROM emails GROUP BY direction;

-- Email status breakdown
SELECT status, COUNT(*) as count FROM emails GROUP BY status;
```

### Tasks
```sql
-- Recent tasks
SELECT * FROM tasks ORDER BY createdAt DESC LIMIT 10;

-- Task status
SELECT status, COUNT(*) as count FROM tasks GROUP BY status;

-- Task priority
SELECT priority, COUNT(*) as count FROM tasks GROUP BY priority;
```

### Activities & Notes
```sql
-- Recent activities
SELECT * FROM activities ORDER BY createdAt DESC LIMIT 10;

-- Activity types
SELECT type, COUNT(*) as count FROM activities GROUP BY type;

-- Recent notes
SELECT * FROM notes ORDER BY createdAt DESC LIMIT 10;
```

## 🚀 Deployment

The database inspector is automatically included when you deploy your backend:

1. **Files Added**:
   - `database-inspector.html` - Main inspector interface
   - `src/routes/database.js` - API endpoints
   - Updated `app.js` - Routes and endpoints

2. **Deploy**:
   ```bash
   git add .
   git commit -m "Add database inspector tool"
   git push origin main
   ```

3. **Access**: Visit `https://bizbroker-backend.onrender.com/database-inspector`

## 🔍 Usage

1. **Health Check**: Monitor database connection status
2. **Browse Tables**: View all available tables
3. **Inspect Data**: Select a table to view its contents
4. **Run Queries**: Execute custom SQL queries
5. **Manage Data**: Create test data or reset database

## ⚠️ Important Notes

- **Production Safety**: Database reset operations are disabled in production
- **Query Limits**: Only read-only queries are allowed for security
- **Data Privacy**: Be careful when viewing sensitive user data
- **Performance**: Large queries may take time - use LIMIT clauses

## 🎯 Benefits

- **Real-time Monitoring**: See database health and statistics instantly
- **Data Exploration**: Easily browse and understand your data structure
- **Debugging**: Quickly identify data issues and inconsistencies
- **Testing**: Generate test data for development and testing
- **Documentation**: Visual representation of your database schema

The database inspector provides a powerful, user-friendly interface for managing and monitoring your Bizbroker database, similar to professional database administration tools!
