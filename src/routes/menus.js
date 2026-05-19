const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// PATCH /menus/:id/soldout
router.patch('/:id/soldout', requireAdmin, async (req, res, next) => {
  try {
    const menu = await prisma.menu.update({
      where: { id: req.params.id },
      data: { isSoldout: req.body.isSoldout },
    });
    res.json({ id: menu.id, isSoldout: menu.isSoldout });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
