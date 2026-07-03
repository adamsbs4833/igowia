const express = require('express');
const state = require('../state');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ welcomeMessage: state.getWelcomeMessage() });
});

module.exports = router;
