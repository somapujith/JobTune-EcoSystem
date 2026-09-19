const { pool } = require('./src/config/database');

async function main() {
  try {
    const res = await pool.query('SELECT * FROM subscription_plans ORDER BY tier_level');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
