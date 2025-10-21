// controllers/appointments.controller.js
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { createActivity } = require('../services/activityService');

const prisma = new PrismaClient();

// Validation schemas
const createAppointmentSchema = z.object({
  title: z.string().min(1, "Appointment title is required"),
  clientId: z.string().min(1, "Client ID is required"),
  date: z.string(), // ISO string
  startTime: z.string(), // ISO string
  endTime: z.string(), // ISO string
  type: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']).default('VIDEO'),
  location: z.string().optional(),
  notes: z.string().optional(),
});

const updateAppointmentSchema = z.object({
  title: z.string().min(1, "Appointment title is required").optional(),
  clientId: z.string().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  type: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']).optional(),
});

class AppointmentsController {
  constructor() {
    this.getAppointments = this.getAppointments.bind(this);
    this.createAppointment = this.createAppointment.bind(this);
    this.updateAppointment = this.updateAppointment.bind(this);
    this.deleteAppointment = this.deleteAppointment.bind(this);
    this.getAppointmentById = this.getAppointmentById.bind(this);
    this.getUserAppointments = this.getUserAppointments.bind(this);
    this.cancelAppointment = this.cancelAppointment.bind(this);
  }

  // Get all appointments
  async getAppointments(req, res) {
    try {
      const { page = 1, limit = 10, clientId, status, type } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const whereClause = {};
      
      if (clientId) whereClause.clientId = clientId;
      if (status) whereClause.status = status;
      if (type) whereClause.type = type;

      const appointments = await prisma.appointment.findMany({
        where: whereClause,
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        },
        orderBy: [
          { date: 'asc' },
          { startTime: 'asc' }
        ],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      const total = await prisma.appointment.count({ where: whereClause });

      const formattedAppointments = appointments.map(appointment => ({
        id: appointment.id,
        title: appointment.title,
        clientId: appointment.clientId,
        clientName: `${appointment.client.firstName} ${appointment.client.lastName}`,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        type: appointment.type.toLowerCase(),
        location: appointment.location,
        notes: appointment.notes,
        status: appointment.status.toLowerCase(),
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
      }));

      res.json({
        appointments: formattedAppointments,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error('Get appointments error:', error);
      res.status(500).json({ error: 'Failed to fetch appointments' });
    }
  }

  // Create new appointment
  async createAppointment(req, res) {
    try {
      const validatedData = createAppointmentSchema.parse(req.body);
      
      // Check if client exists
      const client = await prisma.user.findUnique({
        where: { id: validatedData.clientId }
      });

      if (!client) {
        return res.status(400).json({ 
          error: 'Client not found',
          message: `Client with ID ${validatedData.clientId} does not exist` 
        });
      }

      const appointment = await prisma.appointment.create({
        data: {
          title: validatedData.title,
          clientId: validatedData.clientId,
          date: new Date(validatedData.date),
          startTime: new Date(validatedData.startTime),
          endTime: new Date(validatedData.endTime),
          type: validatedData.type,
          location: validatedData.location,
          notes: validatedData.notes,
          status: 'SCHEDULED',
        },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        }
      });

      // Create activity log
      try {
        await createActivity({
          type: 'APPOINTMENT_SCHEDULED',
          title: 'Appointment Scheduled',
          description: `Appointment scheduled: ${appointment.title}`,
          userId: validatedData.clientId,
          performedBy: req.user?.id || 'system',
          metadata: {
            appointmentId: appointment.id,
            type: validatedData.type,
            date: validatedData.date,
          },
        });
      } catch (activityError) {
        console.error('Failed to create activity:', activityError);
      }

      res.status(201).json({
        message: 'Appointment created successfully',
        appointment: {
          id: appointment.id,
          title: appointment.title,
          clientId: appointment.clientId,
          clientName: `${appointment.client.firstName} ${appointment.client.lastName}`,
          date: appointment.date,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          type: appointment.type.toLowerCase(),
          location: appointment.location,
          notes: appointment.notes,
          status: appointment.status.toLowerCase(),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: error.errors 
        });
      }
      console.error('Create appointment error:', error);
      res.status(500).json({ error: 'Failed to create appointment' });
    }
  }

  // Update appointment
  async updateAppointment(req, res) {
    try {
      const { id } = req.params;
      const validatedData = updateAppointmentSchema.parse(req.body);

      const existingAppointment = await prisma.appointment.findUnique({
        where: { id },
      });

      if (!existingAppointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const updateData = { ...validatedData };
      
      // Convert date strings to Date objects
      if (validatedData.date) updateData.date = new Date(validatedData.date);
      if (validatedData.startTime) updateData.startTime = new Date(validatedData.startTime);
      if (validatedData.endTime) updateData.endTime = new Date(validatedData.endTime);

      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: updateData,
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        }
      });

      res.json({
        message: 'Appointment updated successfully',
        appointment: {
          id: updatedAppointment.id,
          title: updatedAppointment.title,
          clientId: updatedAppointment.clientId,
          clientName: `${updatedAppointment.client.firstName} ${updatedAppointment.client.lastName}`,
          date: updatedAppointment.date,
          startTime: updatedAppointment.startTime,
          endTime: updatedAppointment.endTime,
          type: updatedAppointment.type.toLowerCase(),
          location: updatedAppointment.location,
          notes: updatedAppointment.notes,
          status: updatedAppointment.status.toLowerCase(),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Update appointment error:', error);
      res.status(500).json({ error: 'Failed to update appointment' });
    }
  }

  // Cancel appointment
  async cancelAppointment(req, res) {
    try {
      const { id } = req.params;

      const appointment = await prisma.appointment.findUnique({
        where: { id },
      });

      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        }
      });

      res.json({
        message: 'Appointment cancelled successfully',
        appointment: {
          id: updatedAppointment.id,
          status: updatedAppointment.status.toLowerCase(),
        },
      });
    } catch (error) {
      console.error('Cancel appointment error:', error);
      res.status(500).json({ error: 'Failed to cancel appointment' });
    }
  }

  // Delete appointment
  async deleteAppointment(req, res) {
    try {
      const { id } = req.params;

      const existingAppointment = await prisma.appointment.findUnique({
        where: { id },
      });

      if (!existingAppointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      await prisma.appointment.delete({
        where: { id },
      });

      res.json({ message: 'Appointment deleted successfully' });
    } catch (error) {
      console.error('Delete appointment error:', error);
      res.status(500).json({ error: 'Failed to delete appointment' });
    }
  }

  // Get single appointment
  async getAppointmentById(req, res) {
    try {
      const { id } = req.params;

      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        }
      });

      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      res.json({
        appointment: {
          id: appointment.id,
          title: appointment.title,
          clientId: appointment.clientId,
          clientName: `${appointment.client.firstName} ${appointment.client.lastName}`,
          date: appointment.date,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          type: appointment.type.toLowerCase(),
          location: appointment.location,
          notes: appointment.notes,
          status: appointment.status.toLowerCase(),
        },
      });
    } catch (error) {
      console.error('Get appointment by ID error:', error);
      res.status(500).json({ error: 'Failed to fetch appointment' });
    }
  }

  // Get appointments for a specific user
  async getUserAppointments(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10, status, type } = req.query;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const whereClause = { clientId: userId };
      
      if (status) whereClause.status = status;
      if (type) whereClause.type = type;

      const appointments = await prisma.appointment.findMany({
        where: whereClause,
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          }
        },
        orderBy: [
          { date: 'asc' },
          { startTime: 'asc' }
        ],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      const total = await prisma.appointment.count({ where: whereClause });

      const formattedAppointments = appointments.map(appointment => ({
        id: appointment.id,
        title: appointment.title,
        clientId: appointment.clientId,
        clientName: `${appointment.client.firstName} ${appointment.client.lastName}`,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        type: appointment.type.toLowerCase(),
        location: appointment.location,
        notes: appointment.notes,
        status: appointment.status.toLowerCase(),
      }));

      res.json({
        appointments: formattedAppointments,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      console.error('Get user appointments error:', error);
      res.status(500).json({ error: 'Failed to fetch user appointments' });
    }
  }
}

module.exports = { AppointmentsController };