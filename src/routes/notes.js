// routes/notes.routes.js
const { Router } = require('express');
const { NotesController } = require('../controllers/notes');

const router = Router();
const notesController = new NotesController();

// Notes management routes

// Get all notes with pagination and filtering
router.get('/', notesController.getNotes);

// Create a new note
router.post('/', notesController.createNote);

// Get a specific note by ID
router.get('/:id', notesController.getNoteById);

// Update a note
router.put('/:id', notesController.updateNote);

// Delete a note
router.delete('/:id', notesController.deleteNote);

// Get notes for a specific user
router.get('/user/:userId', notesController.getUserNotes);

module.exports = router;