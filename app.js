const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const format = require("date-fns/format");

const app = express();
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
app.use(express.json());

const initializeDbAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () =>
      console.log("Server Running At: http://localhost:3000/")
    );
  } catch (error) {
    console.log(`Data Base Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const authenticationVeryFaying = async (request, response, next) => {
  let jwtToken;
  const authorHeader = request.headers["authorization"];
  if (authorHeader !== undefined) {
    jwtToken = authorHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "prasanth", async (error, payload) => {
      if (error) {
        response.status(400);
        response.send("Invalid JWT Token");
      } else {
        const { user_id } = await db.get(
          `SELECT user_id FROM user WHERE username="${payload.username}"`
        );
        request.userId = user_id;
        next();
      }
    });
  } else {
    response.status(400);
    response.send("Invalid JWT Token");
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userStatusQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userStatus = await db.get(userStatusQuery);
  if (userStatus === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createdUserQuery = `
      INSERT INTO 
        user(name,username,password,gender)
      VALUES("${name}","${username}","${hashedPassword}","${gender}")`;
      await db.run(createdUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userFoundQuery = `SELECT * FROM user WHERE username = "${username}"`;
  const userFound = await db.get(userFoundQuery);
  if (userFound !== undefined) {
    const isPasswordMatch = await bcrypt.compare(password, userFound.password);
    if (isPasswordMatch) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "prasanth");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

app.get(
  "/user/tweets/feed/",
  authenticationVeryFaying,
  async (request, response) => {
    const { userId } = request;
    const getTweetsQuery = `
    SELECT 
      user.username,tweet.tweet,tweet.date_time as dateTime
    FROM
      (follower JOIN tweet ON follower.following_user_id=tweet.user_id)as T
      JOIN user ON T.user_id = user.user_id
    ORDER BY 
      tweet.date_time DESC
    LIMIT 4`;
    const tweetsArray = await db.all(getTweetsQuery);
    response.send(tweetsArray);
  }
);

app.get(
  "/user/following/",
  authenticationVeryFaying,
  async (request, response) => {
    const { userId } = request;
    const userFollowingQuery = `
    SELECT
      user.username
    FROM
      user JOIN follower ON user.user_id=follower.following_user_id
    WHERE
      follower.follower_user_id = ${userId}`;
    const userFollowing = await db.all(userFollowingQuery);
    response.send(userFollowing);
  }
);

app.get(
  "/user/followers/",
  authenticationVeryFaying,
  async (request, response) => {
    const { userId } = request;
    const userFollowersQuery = `
    SELECT
      user.username
    FROM
      user JOIN follower ON user.user_id=follower.follower_user_id
    WHERE
      follower.following_user_id = ${userId}`;
    const userFollowers = await db.all(userFollowersQuery);
    response.send(userFollowers);
  }
);

app.get(
  "/tweets/:tweetId/",
  authenticationVeryFaying,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const tweetsDetailsQuery = `
    SELECT 
      tweet.tweet,count(DISTINCT like.like_id) as likes,count(DISTINCT reply.reply_id) as replies,tweet.date_time as dateTime
    FROM
      (tweet JOIN follower ON tweet.user_id = follower.following_user_id) as T
      JOIN like ON T.tweet_id = like.tweet_id
      JOIN reply ON T.tweet_id = reply.tweet_id
    WHERE
      tweet.tweet_id = ${tweetId} and follower.follower_user_id = ${userId}
    `;
    const tweetDetails = await db.get(tweetsDetailsQuery);
    if (tweetDetails !== undefined && tweetDetails.tweet !== null) {
      response.send(tweetDetails);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/likes/",
  authenticationVeryFaying,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const tweetsDetailsQuery = `
    SELECT 
      user.username
    FROM
      (tweet JOIN follower ON tweet.user_id = follower.following_user_id) as T
      JOIN like ON T.tweet_id = like.tweet_id
      JOIN user ON like.user_id = user.user_id
      
    WHERE
      tweet.tweet_id = ${tweetId} and follower.follower_user_id = ${userId}
    `;
    const tweetDetails = await db.all(tweetsDetailsQuery);
    if (tweetDetails !== undefined && tweetDetails.length !== 0) {
      const likes = tweetDetails.map((eachName) => eachName.username);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticationVeryFaying,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const tweetsDetailsQuery = `
    SELECT 
      user.name,reply.reply
    FROM
      (tweet JOIN follower ON tweet.user_id = follower.following_user_id) as T
      JOIN reply ON T.tweet_id = reply.tweet_id
      JOIN user ON reply.user_id = user.user_id
    WHERE
      tweet.tweet_id = ${tweetId} and follower.follower_user_id = ${userId}
    `;
    const tweetDetails = await db.all(tweetsDetailsQuery);
    if (tweetDetails !== undefined && tweetDetails.length !== 0) {
      const replies = tweetDetails;
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/user/tweets/",
  authenticationVeryFaying,
  async (request, response) => {
    const { userId } = request;
    const tweetsDetailsQuery = `
    SELECT 
      tweet.tweet,count(DISTINCT like.like_id) as likes,count(DISTINCT reply.reply_id) as replies,tweet.date_time as dateTime
    FROM
      (tweet JOIN follower ON tweet.user_id = follower.following_user_id) as T
      JOIN like ON T.tweet_id = like.tweet_id
      JOIN reply ON T.tweet_id = reply.tweet_id
    WHERE
      tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id
    `;
    const tweetDetails = await db.all(tweetsDetailsQuery);
    if (tweetDetails !== undefined && tweetDetails.tweet !== null) {
      response.send(tweetDetails);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.post(
  "/user/tweets/",
  authenticationVeryFaying,
  async (request, response) => {
    const { userId } = request;
    const { tweet } = request.body;
    const dateTime = new Date();
    const dateFormat = format(dateTime, "yyyy-MM-dd HH:mm:ss");
    const tweetsQuery = `
    INSERT INTO
      tweet(tweet,user_id,date_time)
    VALUES
      ("${tweet}",${userId},"${dateFormat}")
    `;
    await db.run(tweetsQuery);
    response.send("Created a Tweet");
  }
);

app.delete(
  "/tweets/:tweetId/",
  authenticationVeryFaying,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const tweetsQuery = `
    SELECT * FROM tweet WHERE user_id = ${userId} and tweet_id = ${tweetId}
    `;
    const tweet = await db.all(tweetsQuery);
    if (tweet !== undefined && tweet.length !== 0) {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId}`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
