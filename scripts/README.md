# Scripts

This folder contains all the scripts that scrape data from cinemas and store them in a database.

The `main.ts` script contains the function that:

- Connects to the database
- Looks inside of the `cinemas` directory
- For each `cinema.ts` file it dynamically imports a scraper function
- Runs the scraper function and stores the result in the Database
