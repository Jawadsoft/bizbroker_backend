// routes/tasks.routes.js
const { Router } = require('express');
const { TasksController } = require('../controllers/tasks');

const router = Router();
const tasksController = new TasksController();

// Tasks management routes

// Get all tasks with pagination and filtering
router.get('/', tasksController.getTasks);

// Create a new task
router.post('/', tasksController.createTask);

// Get task statistics
router.get('/stats', tasksController.getTaskStats);

// Get a specific task by ID
router.get('/:id', tasksController.getTaskById);

// Update a task
router.put('/:id', tasksController.updateTask);

// Delete a task
router.delete('/:id', tasksController.deleteTask);

// Mark task as complete (convenience endpoint)
router.patch('/:id/complete', tasksController.markTaskComplete);

// Get tasks for a specific user
router.get('/user/:userId', tasksController.getUserTasks);

module.exports = router;