const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://loaclhost:3000");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();
// Authentication Token
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "abcdefgh", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const snakeCaseToCamelCase = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const snakeCaseToCamelCaseDistricts = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

// Register the user
app.post("/register/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const getUserNameQuery = `
    SELECT * FROM user
    WHERE username = '${username}';`;
  const dbUser = await db.get(getUserNameQuery);
  if (dbUser === undefined) {
    if (password.length < 5) {
      response.status(400);
      response.send("Password Too Short!");
    } else {
      const creatNewUser = `
            INSERT INTO 
                user(username , name , password , gender , location)
            VALUES ('${username}','${name}','${hashedPassword}','${gender}','${location}');`;
      await db.run(creatNewUser);
      response.send("User Created!");
    }
  } else {
    response.status(400);
    response.send("User Already Exists!");
  }
});
// Login API 1
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUsernameQuery = `
    SELECT * FROM user
    WHERE username = '${username}';`;
  const dbUser = await db.get(getUsernameQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "abcdefgh");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 2 Returns a list of all states in the state table
app.get("/states/", authenticationToken, async (request, response) => {
  const getStatesListQuery = `
    SELECT * FROM state;`;
  const statesList = await db.all(getStatesListQuery);
  response.send(statesList.map((eachState) => snakeCaseToCamelCase(eachState)));
});

//API 3 Returns a state based on the state ID
app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT * FROM state
    WHERE state_id = '${stateId}';`;
  const StateDetails = await db.get(getStateQuery);
  response.send(snakeCaseToCamelCase(StateDetails));
});

// API 4 Create a district in the district table, district_id is auto-incremented
app.post("/districts/", authenticationToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const addNewDistrictQuery = `
    INSERT INTO
        district (district_name , state_id , cases , cured , active , deaths)
    VALUES ('${districtName}', '${stateId}','${cases}', '${cured}', '${active}', '${deaths}');`;
  const dbResponse = await db.run(addNewDistrictQuery);
  response.send("District Successfully Added");
});

// API 5 Returns a district based on the district ID
app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictDetailsQuery = `
    SELECT * FROM district
    WHERE district_id = '${districtId}';`;
    const districtDetails = await db.get(getDistrictDetailsQuery);
    response.send(snakeCaseToCamelCaseDistricts(districtDetails));
  }
);

// API 6 Deletes a district from the district table based on the district ID
app.delete(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE FROM district
    WHERE district_id = '${districtId}';`;
    const deletedDistrict = await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

// API 7 Updates the details of a specific district based on the district ID
app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictDetailsQuery = `
    UPDATE district
    SET 
        district_name = '${districtName}',
        state_id = '${stateId}',
        cases='${cases}',
        cured = '${cured}',
        active= '${active}',
        deaths= '${deaths}'
    WHERE district_id = '${districtId}';`;
    const updatedDistrictDetails = await db.run(updateDistrictDetailsQuery);
    response.send("District Details Updated");
  }
);
// API 8 Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStatsOfStateQuery = `
    SELECT 
        SUM(cases),
        SUM(cured),
        SUM(active),
        SUM(deaths)
    FROM
        district
    WHERE state_id = '${stateId}'; `;
    const statsDetails = await db.get(getStatsOfStateQuery);
    response.send({
      totalCases: statsDetails["SUM(cases)"],
      totalCured: statsDetails["SUM(cured)"],
      totalActive: statsDetails["SUM(active)"],
      totalDeaths: statsDetails["SUM(deaths)"],
    });
  }
);

module.exports = app;
