

export const execute = async (db, sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        resolve();
      });
    });
  };
  