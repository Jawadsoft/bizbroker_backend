const express = require('express');
const { PrismaClient } = require('@prisma/client');
const stripe = require('../config/stripe');
const auth0Management = require('../config/auth0');
const { sendWelcomeEmail } = require('../services/emailService');
const { generateTempPassword, generateTransactionId } = require('../utils/helpers');

const router = express.Router();
const prisma = new PrismaClient();

// Stripe webhook endpoint
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`🔔 Received webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleSuccessfulPayment(event.data.object);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionCancellation(event.data.object);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      default:
        console.log(`🤷‍♂️ Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`❌ Error processing webhook ${event.type}:`, error);
    return res.status(500).send('Webhook processing failed');
  }

  res.json({ received: true });
});

// Handle successful payment
async function handleSuccessfulPayment(session) {
  const { customer, subscription, metadata } = session;
  
  console.log(`💰 Processing successful payment for company: ${metadata.companyName}`);

  try {
    // Step 1: Update company status
    const company = await prisma.company.update({
      where: { id: metadata.companyId },
      data: {
        stripeCustomerId: customer,
        subscriptionId: subscription,
        subscriptionStatus: 'ACTIVE',
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        isActive: true
      }
    });

    // Step 2: Create Auth0 user
    const tempPassword = generateTempPassword();
    
    const auth0User = await auth0Management.createUser({
      email: company.email,
      password: tempPassword,
      connection: 'Username-Password-Authentication',
      given_name: metadata.firstName,
      family_name: metadata.lastName,
      app_metadata: {
        companyId: company.id,
        role: 'ADMIN',
        subdomain: company.subdomain
      },
      user_metadata: {
        company_name: company.name,
        subdomain: company.subdomain
      }
    });

    console.log(`👤 Auth0 user created: ${auth0User.user_id}`);

    // Step 3: Create local user record
    await prisma.user.create({
      data: {
        companyId: company.id,
        auth0UserId: auth0User.user_id,
        email: company.email,
        firstName: metadata.firstName,
        lastName: metadata.lastName,
        role: 'ADMIN',
        status: 'ACTIVE'
      }
    });

    // Step 4: Record payment history
    await prisma.paymentHistory.create({
      data: {
        companyId: company.id,
        transactionId: generateTransactionId(),
        stripePaymentId: session.payment_intent,
        plan: metadata.plan.toUpperCase(),
        amount: session.amount_total / 100, // Convert from cents
        paymentMethod: 'Credit Card',
        status: 'COMPLETED',
        billingPeriod: 'MONTHLY'
      }
    });

    // Step 5: Send welcome email
    await sendWelcomeEmail({
      email: company.email,
      companyName: company.name,
      subdomain: company.subdomain,
      firstName: metadata.firstName,
      tempPassword
    });

    console.log(`✅ Onboarding completed successfully for ${company.name}`);

  } catch (error) {
    console.error('❌ Onboarding process failed:', error);
    
    // TODO: Implement failure handling (maybe notify admin, queue for retry)
    // You might want to update company status to 'SETUP_FAILED' for manual review
  }
}

// Handle subscription updates
async function handleSubscriptionUpdate(subscription) {
  console.log(`🔄 Subscription updated: ${subscription.id}`);
  
  try {
    const company = await prisma.company.findFirst({
      where: { subscriptionId: subscription.id }
    });

    if (company) {
      await prisma.company.update({
        where: { id: company.id },
        data: {
          subscriptionStatus: subscription.status.toUpperCase(),
          nextBillingDate: new Date(subscription.current_period_end * 1000)
        }
      });
    }
  } catch (error) {
    console.error('❌ Failed to update subscription:', error);
  }
}

// Handle subscription cancellation
async function handleSubscriptionCancellation(subscription) {
  console.log(`❌ Subscription cancelled: ${subscription.id}`);
  
  try {
    const company = await prisma.company.findFirst({
      where: { subscriptionId: subscription.id }
    });

    if (company) {
      await prisma.company.update({
        where: { id: company.id },
        data: {
          subscriptionStatus: 'CANCELLED',
          isActive: false
        }
      });
    }
  } catch (error) {
    console.error('❌ Failed to handle cancellation:', error);
  }
}

// Handle recurring payment success
async function handlePaymentSucceeded(invoice) {
  if (invoice.subscription) {
    console.log(`💳 Payment succeeded for subscription: ${invoice.subscription}`);
    
    try {
      const company = await prisma.company.findFirst({
        where: { subscriptionId: invoice.subscription }
      });

      if (company) {
        // Record payment
        await prisma.paymentHistory.create({
          data: {
            companyId: company.id,
            transactionId: generateTransactionId(),
            stripePaymentId: invoice.payment_intent,
            plan: company.currentPlan,
            amount: invoice.amount_paid / 100,
            paymentMethod: 'Credit Card',
            status: 'COMPLETED',
            billingPeriod: 'MONTHLY'
          }
        });

        // Update next billing date
        await prisma.company.update({
          where: { id: company.id },
          data: {
            nextBillingDate: new Date(invoice.period_end * 1000),
            totalSpent: {
              increment: invoice.amount_paid / 100
            }
          }
        });
      }
    } catch (error) {
      console.error('❌ Failed to record payment:', error);
    }
  }
}

// Handle payment failure
async function handlePaymentFailed(invoice) {
  if (invoice.subscription) {
    console.log(`💸 Payment failed for subscription: ${invoice.subscription}`);
    
    try {
      const company = await prisma.company.findFirst({
        where: { subscriptionId: invoice.subscription }
      });

      if (company) {
        await prisma.company.update({
          where: { id: company.id },
          data: {
            subscriptionStatus: 'PAST_DUE'
          }
        });

        // TODO: Send payment failure notification email
      }
    } catch (error) {
      console.error('❌ Failed to handle payment failure:', error);
    }
  }
}

module.exports = router;