const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();

// Enable CORS for all requests
app.use(cors());

// Connect to the new SQLite database
const db = new sqlite3.Database('./app_database.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the database.');
    }
});

// Middleware
app.use(express.json());

// Create UserTable, ClientTable, TransacTable, and other tables
// You can run the CREATE TABLE SQL queries here to ensure the tables are set up
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS UserTable (
            UserID INTEGER PRIMARY KEY AUTOINCREMENT,
            Hierarchy INTEGER NOT NULL,
            Username TEXT NOT NULL,
            Nombre TEXT NOT NULL,
            DNI TEXT,
            Telefono TEXT,
            Correo TEXT,
            Password TEXT NOT NULL,
            STATUS TEXT DEFAULT 'Active',
            Fecha_STATUS DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS ClientTable (
            ClientID INTEGER PRIMARY KEY AUTOINCREMENT,
            Descript TEXT NOT NULL,
            NombreRef TEXT,
            DNIRef TEXT,
            Nro_WSP TEXT,
            Correo TEXT,
            Ref_Address TEXT,
            Last_Lat_Long TEXT,
            FechaModif DATETIME DEFAULT CURRENT_TIMESTAMP,
            Saldo INTEGER DEFAULT 0,
            STATUS TEXT DEFAULT 'Active',
            Last_Modif_By INTEGER,
            FOREIGN KEY (Last_Modif_By) REFERENCES UserTable(UserID)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS TransacTable (
            TransacID INTEGER PRIMARY KEY AUTOINCREMENT,
            ClientID INTEGER NOT NULL,
            UserID INTEGER NOT NULL,
            Valor INTEGER NOT NULL,
            Pago_EFE INTEGER DEFAULT 0,
            Pago_MP INTEGER DEFAULT 0,
            Pago_BOT INTEGER DEFAULT 0,
            Deuda INTEGER DEFAULT 0,
            Lat_Long TEXT,
            Fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ClientID) REFERENCES ClientTable(ClientID) ON DELETE RESTRICT,
            FOREIGN KEY (UserID) REFERENCES UserTable(UserID) ON DELETE RESTRICT
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS InventarioTable (
            TransacID INTEGER NOT NULL,
            Srvc_Prod_ID INTEGER NOT NULL,
            Amount INTEGER NOT NULL,
            Costo INTEGER NOT NULL,
            PRIMARY KEY (TransacID, Srvc_Prod_ID),
            FOREIGN KEY (TransacID) REFERENCES TransacTable(TransacID) ON DELETE RESTRICT,
            FOREIGN KEY (Srvc_Prod_ID) REFERENCES Srvc_ProdTable(Srvc_Prod_ID) ON DELETE RESTRICT
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS Srvc_ProdTable (
            Srvc_Prod_ID INTEGER PRIMARY KEY AUTOINCREMENT,
            Descript TEXT NOT NULL,
            Valor INTEGER NOT NULL,
            FechaAct DATETIME DEFAULT CURRENT_TIMESTAMP,
            UserID INTEGER NOT NULL,
            FOREIGN KEY (UserID) REFERENCES UserTable(UserID) ON DELETE RESTRICT
        );
    `);

    // Check if the admin user already exists in the UserTable
    db.get("SELECT * FROM UserTable WHERE UserID = 1 AND Username = 'admin'", (err, row) => {
        if (err) {
            console.error('Error checking admin user:', err.message);
        } else {
            // If no user found, insert a default admin user
            if (!row) {
                const stmt = db.prepare(`
                    INSERT INTO UserTable (Hierarchy, Username, Nombre, Password)
                    VALUES (1, 'admin', 'Administrator', 'admin')
                `);
                stmt.run();
                stmt.finalize(() => {
                    console.log('Admin user created!');
                });
            } else {
                console.log('Admin user already exists.');
            }
        }
    });
});

// Base route (for testing)
app.get('/', (req, res) => {
    res.send('Welcome to the server!');
});

// GET login endpoint to validate username and password
app.get('/login', (req, res) => {
    const { Username, Password } = req.query;

    if (!Username || !Password) {
        return res.status(400).json({ error: "Username and Password are required" });
    }

    const sql = 'SELECT * FROM UserTable WHERE Username = ? AND Password = ?';
    db.get(sql, [Username, Password], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else if (row) {
            // If credentials match, return user data including hierarchy
            res.json({
                message: 'Login successful',
                user: {
                    id: row.UserID,
                    username: row.Username,
                    hierarchy: row.Hierarchy,
                    nombre: row.Nombre,
                    dni: row.DNI,
                    telefono: row.Telefono,
                    correo: row.Correo,
                }
            });
        } else {
            // If no user is found, return an error message
            res.status(401).json({ error: 'Invalid username or password' });
        }
    });
});

// Endpoint to register a new user
app.post('/register', (req, res) => {
    const { hierarchy, username, nombre, dni, telefono, correo, password } = req.body;
  
    // Validation: Check if required fields are missing
    if (!hierarchy || !username || !nombre || !password) {
      return res.status(400).json({ message: 'Hierarchy, Username, Nombre, and Password are required.' });
    }
  
    // Optional Fields Validation (e.g., for DNI, Telefono, Correo)
    if (dni && dni.trim() === '') {
      return res.status(400).json({ message: 'DNI cannot be empty if provided.' });
    }
    if (telefono && telefono.trim() === '') {
      return res.status(400).json({ message: 'Telefono cannot be empty if provided.' });
    }
    if (correo && correo.trim() === '') {
      return res.status(400).json({ message: 'Correo cannot be empty if provided.' });
    }
  
    // SQL query to insert the new user into the UserTable
    const query = `
      INSERT INTO UserTable (Hierarchy, Username, Nombre, DNI, Telefono, Correo, Password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
  
    // Execute query
    db.run(query, [hierarchy, username, nombre, dni, telefono, correo, password], function (err) {
      if (err) {
        console.error('Error inserting user:', err);
        return res.status(500).json({ message: 'Error inserting user' });
      }
      res.status(200).json({ message: 'User registered successfully', userId: this.lastID });
    });
  });

// POST endpoint to register a new client
app.post("/register-client", (req, res) => {
    const { Descript, NombreRef, DNIRef, Nro_WSP, Correo, Ref_Address, Last_Lat_Long, Saldo, Last_Modif_By } = req.body;

    // Validate required fields
    if (!Descript) {
        return res.status(400).json({ error: "Descript is required" });
    }
    if (!Last_Modif_By) {
        return res.status(400).json({ error: "Last_Modif_By is required" });
    }

    const sql = `
        INSERT INTO ClientTable (Descript, NombreRef, DNIRef, Nro_WSP, Correo, Ref_Address, Last_Lat_Long, Saldo, Last_Modif_By)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [Descript, NombreRef || null, DNIRef || null, Nro_WSP || null, Correo || null, Ref_Address || null, Last_Lat_Long || null, Saldo || 0, Last_Modif_By];

    db.run(sql, values, function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            message: "Client registered successfully",
            clientID: this.lastID
        });
    });
});



// POST endpoint to register a new product/service
app.post('/register-product', (req, res) => {
    const { Descript, Valor, UserID } = req.body;

    // Validate required fields
    if (!Descript) {
        return res.status(400).json({ error: "Descript is required" });
    }
    if (!Valor || isNaN(Valor)) {
        return res.status(400).json({ error: "Valid Valor is required" });
    }
    if (!UserID) {
        return res.status(400).json({ error: "UserID is required" });
    }

    const sql = `
        INSERT INTO Srvc_ProdTable (Descript, Valor, UserID)
        VALUES (?, ?, ?)`;

    const values = [Descript, Valor, UserID];

    db.run(sql, values, function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            message: "Product/Service registered successfully",
            Srvc_Prod_ID: this.lastID
        });
    });
});


app.post('/search-clients', (req, res) => {
    const { field, searchText } = req.body;

    // Validate field input
    if (!['description', 'dni', 'nombreRef'].includes(field)) {
        return res.status(400).json({ error: 'Invalid search field' });
    }

    // Construct the SQL query dynamically based on the provided field
    let sql = `SELECT * FROM ClientTable WHERE 1=1`;
    let values = [];

    // Search by the specified field
    if (field === 'description') {
        sql += ` AND Descript LIKE ?`;
        values.push(`%${searchText}%`);
    } else if (field === 'dni') {
        sql += ` AND DNIRef LIKE ?`;
        values.push(`%${searchText}%`);
    } else if (field === 'nombreRef') {
        sql += ` AND NombreRef LIKE ?`;
        values.push(`%${searchText}%`);
    }

    db.all(sql, values, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Endpoint to register a new transaction
app.post('/registerTransaction', (req, res) => {
    const { clientId, userId, Valor, Pago_EFE, Pago_MP, Deuda, Lat_long } = req.body;

    const query = `
        INSERT INTO TransacTable (ClientID, UserID, Valor, Pago_EFE, Pago_MP, Deuda, Lat_Long)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [clientId, userId, Valor, Pago_EFE, Pago_MP, Deuda, Lat_long];

    db.run(query, params, function (err) {
        if (err) {
            console.error('Error inserting data:', err.message);
            return res.status(500).json({ error: 'Failed to insert transaction' });
        }

        // Return the TransacID generated (this refers to the last inserted row ID)
        res.json({ TransacID: this.lastID });
    });
});


// Fetch available products
app.get("/products", (req, res) => {
    db.all("SELECT Srvc_Prod_ID, Descript, Valor FROM Srvc_ProdTable", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Ensure that each product's Valor is a number (float or integer).
        const products = rows.map(row => ({
            Srvc_Prod_ID: row.Srvc_Prod_ID,
            Descript: row.Descript,
            Valor: parseFloat(row.Valor)  // Ensuring Valor is a number
        }));

        res.json(products);  // Return the modified products array
    });
});

app.post('/registerInventory', (req, res) => {
    //console.log('Request Body:', req.body); // Log the full request body
    let { transacId, productId, quantity, totalValue } = req.body;

    // Log the types of the incoming data to inspect if they're strings or numbers
    //console.log('TransacID type:', typeof transacId);
    //console.log('productId type:', typeof productId);
    //console.log('quantity type:', typeof quantity);
    //console.log('totalValue type:', typeof totalValue);

    // Explicitly convert the values to integers
    transacId = parseInt(transacId, 10);
    productId = parseInt(productId, 10);
    quantity = parseInt(quantity, 10);
    totalValue = parseInt(totalValue, 10);

    // Validate that all values are integers and not NaN
    if (isNaN(transacId) || isNaN(productId) || isNaN(quantity) || isNaN(totalValue)) {
      return res.status(400).json({
        error: 'Invalid input data, all fields must be integers',
        receivedData: req.body // This shows what was sent
      });
    }

    // Prepare query to insert a product into InventarioTable
    const query = `
      INSERT INTO InventarioTable (TransacID, Srvc_Prod_ID, Amount, Costo)
      VALUES (?, ?, ?, ?)
    `;

    // Insert the product into the table
    db.run(query, [transacId, productId, quantity, totalValue], function (err) {
      if (err) {
        //console.error('Error inserting into InventarioTable:', err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      // Respond with success
      res.status(200).json({ message: 'Inventory updated successfully', lastID: this.lastID });
    });
});

app.post('/updateSaldo', (req, res) => {
    const { clientId, deuda } = req.body;

    //console.log(`Received request to update saldo: clientId=${clientId}, deuda=${deuda}`);

    if (!clientId || deuda === undefined) {
        //console.log("Error: clientId or deuda missing");
        return res.status(400).json({ error: "clientId and deuda are required" });
    }

    db.get("SELECT Saldo FROM ClientTable WHERE ClientID = ?", [clientId], (err, row) => {
        if (err) {
            //console.error("Database error:", err);
            return res.status(500).json({ error: "Database error", details: err });
        }
        if (!row) {
            //console.log(`Client not found: clientId=${clientId}`);
            return res.status(404).json({ error: "Client not found" });
        }

        //console.log(`Current Saldo for clientId=${clientId}: ${row.Saldo}`);
        const newSaldo = row.Saldo - deuda;

        db.run("UPDATE ClientTable SET Saldo = ? WHERE ClientID = ?", [newSaldo, clientId], function (err) {
            if (err) {
                //console.error("Update failed:", err);
                return res.status(500).json({ error: "Update failed", details: err });
            }
            //console.log(`Saldo updated successfully for clientId=${clientId}. New Saldo: ${newSaldo}`);
            res.json({ message: "Saldo updated successfully", newSaldo });
        });
    });
});

// API to fetch last known location
app.post('/getLastLocation', (req, res) => {
    const { clientId } = req.body;

    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' });
    }

    db.get("SELECT Last_Lat_Long FROM ClientTable WHERE ClientID = ?", [clientId], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (row && row.Last_Lat_Long) {
            return res.json({ Last_Lat_Long: row.Last_Lat_Long });
        } else {
            return res.json({ Last_Lat_Long: null });
        }
    });
});

// API to fetch client data by clientId
app.post('/getClientData', (req, res) => {
    const { clientId } = req.body;

    if (!clientId) {
        return res.status(400).json({ error: 'clientId is required' });
    }

    db.get("SELECT * FROM ClientTable WHERE ClientID = ?", [clientId], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (row) {
            return res.json(row); // Return the full client record
        } else {
            return res.status(404).json({ error: 'Client not found' });
        }
    });
});

// API to update client data
app.post('/updateClientData', (req, res) => {
    const { clientId, updatedData } = req.body;

    if (!clientId || !updatedData) {
        return res.status(400).json({ error: 'clientId and updatedData are required' });
    }

    const { Descript, NombreRef, DNIRef, Nro_WSP, Correo, Ref_Address, Last_Lat_Long, Saldo, STATUS } = updatedData;

    const query = `UPDATE ClientTable 
                   SET Descript = ?, NombreRef = ?, DNIRef = ?, Nro_WSP = ?, Correo = ?, Ref_Address = ?, Last_Lat_Long = ?, Saldo = ?, STATUS = ? 
                   WHERE ClientID = ?`;

    db.run(query, [Descript, NombreRef, DNIRef, Nro_WSP, Correo, Ref_Address, Last_Lat_Long, Saldo, STATUS, clientId], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).json({ error: 'Database error' });
        }

        return res.json({ message: 'Client data updated successfully' });
    });
});

app.get("/clients", (req, res) => {
    const sql = "SELECT * FROM ClientTable"; // Fetch all clients

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Error fetching data:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows); // Return all clients
    });
});



// Start the server
app.listen(9904, () => {
    console.log('Server is running on port 9904');
});

process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database closed.');
        }
        process.exit();
    });
});