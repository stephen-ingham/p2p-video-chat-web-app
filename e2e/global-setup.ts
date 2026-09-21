import mysql from 'mysql2/promise';

const tables = ['refreshTokens', 'callParticipants', 'calls', 'users'];

export default async function globalSetup() {
	const connection = await mysql.createConnection({
		host: 'localhost',
		port: 3306,
		user: 'root',
		password: 'e2e-test-password',
		database: 'test-db',
	});

	try {
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
