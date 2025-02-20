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
            Status TEXT NOT NULL DEFAULT 'Activo',
            FOREIGN KEY (UserID) REFERENCES UserTable(UserID) ON DELETE RESTRICT
        );
    `);    

    db.run(`
        CREATE TABLE IF NOT EXISTS Egresos (
            EgresoID INTEGER PRIMARY KEY AUTOINCREMENT,
            UserID INTEGER NOT NULL,
            FechaAct DATETIME DEFAULT CURRENT_TIMESTAMP,
            Class TEXT NOT NULL,   -- Type of expense (Mecanico, Combustible, Varios)
            Descript TEXT NOT NULL, -- Additional details
            Valor INTEGER NOT NULL,
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
    if (Valor === undefined || isNaN(Valor)) {
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


// Fetch only "Activo" products
app.get("/products", (req, res) => {
    const sql = `
        SELECT Srvc_Prod_ID, Descript, Valor 
        FROM Srvc_ProdTable 
        WHERE Status = 'Activo'`;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Ensure that each product's Valor is a number (float or integer).
        const products = rows.map(row => ({
            Srvc_Prod_ID: row.Srvc_Prod_ID,
            Descript: row.Descript,
            Valor: parseFloat(row.Valor)  // Ensuring Valor is a number
        }));

        res.json(products);  // Return the filtered products array
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

app.post('/add-egreso', (req, res) => {
    const { UserID, Class, Descript, Valor } = req.body;

    // Validate required fields
    if (!UserID) return res.status(400).json({ error: "UserID is required" });
    if (!Class) return res.status(400).json({ error: "Class (expense type) is required" });
    if (!Descript) return res.status(400).json({ error: "Descript is required" });
    if (Valor === undefined || isNaN(Valor)) {
        return res.status(400).json({ error: "Valid Valor is required" });
    }

    const sql = `INSERT INTO Egresos (UserID, Class, Descript, Valor) VALUES (?, ?, ?, ?)`;
    const values = [UserID, Class, Descript, Valor];

    db.run(sql, values, function (err) {
        if (err) return res.status(500).json({ error: err.message });

        res.json({
            message: "Egreso added successfully",
            EgresoID: this.lastID
        });
    });
});

app.get("/products/all", (req, res) => {
    const sql = "SELECT Srvc_Prod_ID, Descript, Valor, Status FROM Srvc_ProdTable"; // Get all products

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const products = rows.map(row => ({
            Srvc_Prod_ID: row.Srvc_Prod_ID,
            Descript: row.Descript,
            Valor: parseFloat(row.Valor), // Ensure Valor is a number
            Status: row.Status
        }));

        res.json(products);
    });
});

app.patch("/update-product/:id", (req, res) => {
    const { id } = req.params;
    const { Descript, Valor } = req.body;

    if (!Descript || Valor === undefined || isNaN(Valor)) {
        return res.status(400).json({ error: "Valid Descript and Valor are required" });
    }

    const sql = `UPDATE Srvc_ProdTable SET Descript = ?, Valor = ? WHERE Srvc_Prod_ID = ?`;

    db.run(sql, [Descript, Valor, id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ message: "Product not found" });

        res.json({ message: "Product updated successfully" });
    });
});

app.patch("/update-product-status/:id", (req, res) => {
    const { id } = req.params;
    const { Status } = req.body;

    if (!Status) return res.status(400).json({ error: "Status is required" });

    const sql = `UPDATE Srvc_ProdTable SET Status = ? WHERE Srvc_Prod_ID = ?`;

    db.run(sql, [Status, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ message: "Product not found" });

        res.json({ message: "Status updated successfully" });
    });
});

app.get("/transactions", (req, res) => {
    let { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
        startDate = endDate = today; // Default to today's transactions
    }

    const sql = `
        SELECT 
            T.TransacID,
            T.ClientID,
            U.Nombre AS UserName,  -- Fetching Nombre from UserTable
            T.Valor,
            T.Pago_EFE,
            T.Pago_MP,
            T.Pago_BOT,
            T.Deuda,
            T.Lat_Long,
            T.Fecha
        FROM TransacTable T
        JOIN UserTable U ON T.UserID = U.UserID
        WHERE DATE(T.Fecha) BETWEEN ? AND ?
        ORDER BY T.Fecha DESC;
    `;

    db.all(sql, [startDate, endDate], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});

app.get("/expenses", (req, res) => {
    let { startDate, endDate, UserID } = req.query;

    if (!startDate || !endDate) {
        const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
        startDate = endDate = today; // Default to today's expenses
    }

    const sql = `
        SELECT 
            E.EgresoID,
            U.Nombre AS UserName,  -- Fetching Nombre from UserTable
            E.FechaAct,
            E.Class,
            E.Descript,
            E.Valor
        FROM Egresos E
        JOIN UserTable U ON E.UserID = U.UserID
        WHERE DATE(E.FechaAct) BETWEEN ? AND ?
        ${UserID ? "AND E.UserID = ?" : ""}
        ORDER BY E.FechaAct DESC;
    `;

    const params = UserID ? [startDate, endDate, UserID] : [startDate, endDate];

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});

app.get("/inventory", (req, res) => {
    let { startDate, endDate, UserID } = req.query;

    if (!startDate || !endDate) {
        const today = new Date().toISOString().split('T')[0]; // Default: Today
        startDate = endDate = today;
    }

    const sql = `
        SELECT 
            I.TransacID,
            T.Fecha,
            U.Nombre AS UserName,
            P.Descript AS ProductName,
            I.Amount,
            I.Costo,
            (I.Amount * I.Costo) AS TotalCost
        FROM InventarioTable I
        JOIN TransacTable T ON I.TransacID = T.TransacID
        JOIN UserTable U ON T.UserID = U.UserID
        JOIN Srvc_ProdTable P ON I.Srvc_Prod_ID = P.Srvc_Prod_ID
        WHERE DATE(T.Fecha) BETWEEN ? AND ?
        ${UserID ? "AND T.UserID = ?" : ""}
        ORDER BY T.Fecha DESC;
    `;

    const params = UserID ? [startDate, endDate, UserID] : [startDate, endDate];

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});

app.get("/inventory-summary", (req, res) => {
    let { startDate, endDate, UserID } = req.query;

    if (!startDate || !endDate) {
        const today = new Date().toISOString().split('T')[0]; // Default: Today
        startDate = endDate = today;
    }

    const sql = `
        SELECT 
            P.Descript AS ProductName,
            SUM(I.Amount) AS TotalAmount
        FROM InventarioTable I
        JOIN TransacTable T ON I.TransacID = T.TransacID
        JOIN Srvc_ProdTable P ON I.Srvc_Prod_ID = P.Srvc_Prod_ID
        WHERE DATE(T.Fecha) BETWEEN ? AND ?
        ${UserID ? "AND T.UserID = ?" : ""}
        GROUP BY P.Srvc_Prod_ID
        ORDER BY TotalAmount DESC;
    `;

    const params = UserID ? [startDate, endDate, UserID] : [startDate, endDate];

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});

app.get("/consolidated-report", async (req, res) => {
    let { startDate, endDate, UserID } = req.query;

    if (!startDate || !endDate) {
        const today = new Date().toISOString().split("T")[0]; // Default to today
        startDate = endDate = today;
    }

    try {
        // Fetch transactions (Now includes Client Name)
        const transactions = await fetchData(`/transactions?startDate=${startDate}&endDate=${endDate}${UserID ? `&UserID=${UserID}` : ""}`);

        // Fetch expenses
        const expenses = await fetchData(`/expenses?startDate=${startDate}&endDate=${endDate}${UserID ? `&UserID=${UserID}` : ""}`);

        // Fetch inventory
        const inventory = await fetchData(`/inventory?startDate=${startDate}&endDate=${endDate}${UserID ? `&UserID=${UserID}` : ""}`);

        // Fetch client names
        const clients = await fetchData(`/clients`); // New API to fetch all clients

        // Create a map of ClientID -> Client Name (`Descript`)
        let clientMap = {};
        clients.forEach(client => {
            clientMap[client.ClientID] = client.Descript;
        });

        // Group transactions by TransacID and attach Client Name
        let transactionsWithItems = transactions.map(transaction => {
            let relatedItems = inventory.filter(item => item.TransacID === transaction.TransacID);
            return {
                ...transaction,
                Items: relatedItems,
                ClientName: clientMap[transaction.ClientID] || "Unknown Client" // Attach Client Name
            };
        });

        // Compute Total Caja (Pago_EFE - Total Egresos)
        let totalPagoEFE = transactions.reduce((sum, t) => sum + t.Pago_EFE, 0);
        let totalEgresos = expenses.reduce((sum, e) => sum + e.Valor, 0);
        let cajaTotal = totalPagoEFE - totalEgresos;

        // Compute Total Win (Total Transaction Valor - Total Expenses)
        let totalTransactionValor = transactions.reduce((sum, t) => sum + t.Valor, 0);
        let totalWin = totalTransactionValor - totalEgresos;

        // Construct response
        let consolidatedData = {
            time_range: { startDate, endDate },
            caja_total: cajaTotal,
            total_win: totalWin,
            transactions: transactionsWithItems, // Now includes `ClientName`
            expenses: expenses
        };

        res.json(consolidatedData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to fetch from internal APIs
function fetchData(endpoint) {
    return new Promise((resolve, reject) => {
        const url = `https://appservertest.onrender.com${endpoint}`;
        fetch(url)
            .then(res => res.json())
            .then(data => resolve(data))
            .catch(err => reject(err));
    });
}

app.get("/users", (req, res) => {
    const sql = `
        SELECT UserID, Nombre
        FROM UserTable
        WHERE STATUS = 'Active'
        ORDER BY Nombre ASC;
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});

app.put("/clients/:id/status", (req, res) => {
    const clientId = req.params.id;
    const { STATUS } = req.body;

    if (!["Active", "Inactive"].includes(STATUS)) {
        return res.status(400).json({ error: "Invalid status. Use 'Active' or 'Inactive'." });
    }

    const sql = `UPDATE ClientTable SET STATUS = ?, FechaModif = CURRENT_TIMESTAMP WHERE ClientID = ?`;

    db.run(sql, [STATUS, clientId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Client status updated to ${STATUS}`, changes: this.changes });
    });
});

// 📌 GET: Fetch all clients
app.get("/clients", (req, res) => {
    db.all("SELECT * FROM ClientTable ORDER BY Descript ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 📌 PUT: Update client details
app.put("/clients/:id", (req, res) => {
    const clientId = req.params.id;
    const { Descript, NombreRef, DNIRef, Nro_WSP, Correo, Ref_Address, Last_Lat_Long, Saldo, STATUS, Last_Modif_By } = req.body;

    const sql = `
        UPDATE ClientTable 
        SET Descript = ?, NombreRef = ?, DNIRef = ?, Nro_WSP = ?, Correo = ?, Ref_Address = ?, 
            Last_Lat_Long = ?, FechaModif = CURRENT_TIMESTAMP, Saldo = ?, STATUS = ?, Last_Modif_By = ?
        WHERE ClientID = ?
    `;

    const params = [Descript, NombreRef, DNIRef, Nro_WSP, Correo, Ref_Address, Last_Lat_Long, Saldo, STATUS, Last_Modif_By, clientId];

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Client updated successfully", changes: this.changes });
    });
});

app.put("/clients/:id", (req, res) => {
    const clientId = req.params.id;
    const { Descript, NombreRef, DNIRef, Nro_WSP, Correo, Ref_Address, Last_Lat_Long, Saldo } = req.body;

    const sql = `
        UPDATE ClientTable 
        SET Descript = ?, NombreRef = ?, DNIRef = ?, Nro_WSP = ?, Correo = ?, 
            Ref_Address = ?, Last_Lat_Long = ?, Saldo = ?, FechaModif = CURRENT_TIMESTAMP 
        WHERE ClientID = ?`;

    db.run(sql, [Descript, NombreRef, DNIRef, Nro_WSP, Correo, Ref_Address, Last_Lat_Long, Saldo, clientId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Client updated successfully", changes: this.changes });
    });
});

app.get("/user-management", (req, res) => {
    const sql = "SELECT UserID, Hierarchy, Username, Nombre, DNI, Telefono, Correo, STATUS FROM UserTable";

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put("/user-management/update/:id", (req, res) => {
    const userId = req.params.id;
    const { Hierarchy, Nombre, DNI, Telefono, Correo } = req.body;

    const sql = `UPDATE UserTable SET Hierarchy = ?, Nombre = ?, DNI = ?, Telefono = ?, Correo = ?, Fecha_STATUS = CURRENT_TIMESTAMP WHERE UserID = ?`;

    db.run(sql, [Hierarchy, Nombre, DNI, Telefono, Correo, userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        res.json({ message: "User updated successfully" });
    });
});

app.put("/user-management/status/:id", (req, res) => {
    const userId = req.params.id;
    const { STATUS } = req.body;

    if (!STATUS) return res.status(400).json({ error: "STATUS field is required." });

    const sql = `UPDATE UserTable SET STATUS = ?, Fecha_STATUS = CURRENT_TIMESTAMP WHERE UserID = ?`;

    db.run(sql, [STATUS, userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        res.json({ message: "User status updated successfully" });
    });
});

// Endpoint to update user password
app.put("/user-management/password/:id", (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const sql = `UPDATE UserTable SET Password = ? WHERE UserID = ?`;

    db.run(sql, [newPassword, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ message: "User not found" });

        res.json({ message: "Password updated successfully" });
    });
});


// Populate the database with test data
app.post("/populate-test-data", (req, res) => {
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // Insert Users
        db.run(`INSERT INTO UserTable (Hierarchy, Username, Nombre, DNI, Telefono, Correo, Password) VALUES 
                (1, 'admin', 'Juan Perez', '12345678', '555-1234', 'juan@example.com', 'pass123'),
                (2, 'seller', 'Maria Gomez', '87654321', '555-5678', 'maria@example.com', 'pass456')`);

        // Insert Clients
        db.run(`INSERT INTO ClientTable (Descript, NombreRef, DNIRef, Nro_WSP, Correo, Ref_Address, Last_Lat_Long, FechaModif, Saldo, STATUS, Last_Modif_By) VALUES 
                ('Regular Customer', 'Carlos Lopez', '99887766', '555-9999', 'carlos@example.com', 'Street 123', '-34.6037,-58.3816', DATETIME('now'), 0, 'Active', 1),
                ('Business Client', 'Ana Martinez', '66778899', '555-8888', 'ana@example.com', 'Avenue 456', '-34.5987,-58.3852', DATETIME('now'), 0, 'Active', 2),
                ('VIP Client', 'Luis Ramirez', '55443322', '555-7777', 'luis@example.com', 'Street 789', '-34.6020,-58.3800', DATETIME('now'), 0, 'Active', 1)`);

        // Insert Products/Services
        db.run(`INSERT INTO Srvc_ProdTable (Descript, Valor, UserID) VALUES 
                ('Bidon 10L', 500, 1),
                ('Bidon 20L', 1000, 2)`);

        // Insert Transactions
        db.run(`INSERT INTO TransacTable (ClientID, UserID, Valor, Pago_EFE, Pago_MP, Pago_BOT, Deuda, Lat_Long, Fecha) VALUES 
                (1, 1, 5000, 2000, 2500, 500, 0, '-34.6037,-58.3816', DATETIME('now')),
                (2, 2, 3000, 1000, 1000, 1000, 500, '-34.5987,-58.3852', DATETIME('now')),
                (3, 1, 4000, 2000, 1000, 1000, 0, '-34.6030,-58.3820', DATETIME('now')),
                (3, 2, 6000, 3000, 2000, 1000, 0, '-34.6000,-58.3840', DATETIME('now')),
                (1, 1, 4500, 2500, 1500, 500, 0, '-34.6015,-58.3865', DATETIME('now')),
                (2, 2, 5200, 2200, 2000, 1000, 0, '-34.6045,-58.3890', DATETIME('now')),
                (3, 1, 3200, 1200, 1000, 1000, 0, '-34.6025,-58.3875', DATETIME('now')),
                (1, 2, 4800, 2800, 1000, 1000, 0, '-34.6010,-58.3880', DATETIME('now')),
                (2, 1, 5700, 2700, 2000, 1000, 0, '-34.6035,-58.3905', DATETIME('now')),
                (3, 2, 6100, 3100, 2000, 1000, 0, '-34.6050,-58.3920', DATETIME('now'))`);

        // Insert Inventory (Linked to Transactions)
        db.run(`INSERT INTO InventarioTable (TransacID, Srvc_Prod_ID, Amount, Costo) VALUES 
                (1, 1, 5, 500),
                (1, 2, 2, 1000),
                (2, 1, 3, 500),
                (2, 2, 4, 1000),
                (3, 1, 6, 500),
                (3, 2, 1, 1000),
                (4, 1, 8, 500),
                (4, 2, 2, 1000),
                (5, 1, 7, 500),
                (5, 2, 3, 1000)`);

        // Insert Expenses (Egresos)
        db.run(`INSERT INTO Egresos (UserID, Class, Descript, Valor, FechaAct) VALUES 
                (1, 'Combustible', 'Gas for delivery', 1200, DATETIME('now')),
                (2, 'Mecanico', 'Truck repair', 1700, DATETIME('now')),
                (1, 'Varios', 'Miscellaneous expenses', 800, DATETIME('now'))`);

        db.run("COMMIT", (err) => {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: "Error inserting test data", details: err.message });
            }
            res.json({ message: "Test data inserted successfully!" });
        });
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