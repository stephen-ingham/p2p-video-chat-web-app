import mysql from 'mysql2/promise';

const tables = ['refreshTokens', 'callParticipants', 'calls', 'users'];

// `docker compose up --wait` returns once the API container is running, but
// the API creates these tables asynchronously (Sequelize sync) after that —
// so wait for them rather than racing it.
async function waitForTables(connection: mysql.Connection, timeoutMs = 60_000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		// eslint-disable-next-line no-await-in-loop -- deliberate poll loop
		const [rows] = await connection.query<mysql.RowDataPacket[]>(
			'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?)',
			[tables],
		);
		if (Number(rows[0].count) === tables.length) return;
		if (Date.now() > deadline) {
			throw new Error(
				`Timed out waiting for the API to create: ${tables.join(', ')}`,
			);
		}

		// eslint-disable-next-line no-await-in-loop -- deliberate poll loop
		await new Promise((resolve) => {
			setTimeout(resolve, 1000);
		});
	}
}

export default async function globalSetup() {
	const connection = await mysql.createConnection({
		host: 'localhost',
		port: 3306,
		user: 'root',
		password: 'e2e-test-password',
		database: 'test-db',
	});

	try {
		await waitForTables(connection);
		await connection.query('SET FOREIGN_KEY_CHECKS = 0');
		for (const table of tables) {
			// eslint-disable-next-line no-await-in-loop -- order doesn't matter with FK checks disabled, but keep it simple
			await connection.query(`TRUNCATE TABLE \`${table}\``);
		}

		await connection.query('SET FOREIGN_KEY_CHECKS = 1');
	} finally {
		await connection.end();
	}
}
