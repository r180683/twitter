const express = require("express");
const app = express();
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbpath = path.join(__dirname, "twitterClone.db");
let db = undefined;
module.exports = app;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://locahost:3000");
    });
  } catch (e) {
    console.log(`DB Error :${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const userQuery = `SELECT * FROM user WHERE username='${username}';`;
  const user = await db.get(userQuery);
  if (user === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `INSERT INTO user(username,password,name,gender) VALUES('${username}','${hashPassword}','${name}','${gender}');`;
      const r = await db.run(addUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userQuery = `SELECT * FROM user WHERE username='${username}';`;
  const user = await db.get(userQuery);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const validUser = await bcrypt.compare(password, user.password);
    if (validUser === true) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "secret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//token authenticate
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret", async (error, payload) => {
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

//API 3
//Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserIdQuery);
  const userId = userDetails.user_id;
  const getTweetsQuery = `SELECT user.username AS username,t.tweet AS tweet,t.date_time AS dateTime
     FROM (follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id) AS t
     INNER JOIN user ON t.user_id=user.user_id
     WHERE t.follower_user_id=${userId} ORDER BY t.date_time DESC LIMIT 4;`;
  console.log(getTweetsQuery);
  const r = await db.all(getTweetsQuery);
  response.send(r);
});

//API 4
//Returns the list of all names of people whom the user follows
app.get("/user/following/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserIdQuery);
  const userId = userDetails.user_id;
  const userFollowingQuery = `SELECT user.username AS name
        FROM user INNER JOIN follower ON user.user_id=follower.following_user_id
        WHERE follower.follower_user_id=${userId}`;
  const r = await db.all(userFollowingQuery);
  response.send(r);
});

//API 5
//Returns the list of all names of people who follows the user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserIdQuery);
  const userId = userDetails.user_id;
  console.log(userId);
  const getuserFollowersQuery = `SELECT user.username AS name FROM follower INNER JOIN user ON user.user_id=follower.follower_user_id WHERE follower.following_user_id=${userId};`;
  const r = await db.all(getuserFollowersQuery);
  response.send(r);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;

  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserIdQuery);
  const userId = userDetails.user_id;

  const tweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetResult = await db.get(tweetQuery);
  const userFollowersQuery = `SELECT *
    FROM user
    INNER JOIN follower ON user.user_id=follower.following_user_id 
    WHERE follower.follower_user_id=${userId} ;`;
  const userFollowers = await db.all(userFollowersQuery);

  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    const { tweet_id, date_time, tweet } = tweetResult;
    const getLikesQuery = `SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id=${tweet_id} GROUP BY tweet_id;`;
    const likesObject = await db.get(getLikesQuery);

    const getRepliesQuery = `SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id=${tweet_id} GROUP BY tweet_id;`;
    const repliesObject = await db.get(getRepliesQuery);

    response.send({
      tweet,
      likes: likesObject.likes,
      replies: repliesObject.replies,
      dateTime: date_time,
    });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const username = request.username;
    const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
    const userDetails = await db.get(getUserIdQuery);
    const userId = userDetails.user_id;

    const userFollowingQuery = `SELECT * FROM user INNER JOIN follower ON user.user_id=follower.following_user_id WHERE follower.follower_user_id;`;
    const userFollowers = await db.all(userFollowingQuery);

    const tweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetResult = await db.get(tweetQuery);

    if (
      userFollowers.some(
        (item) => tweetResult.user_id === item.following_user_id
      )
    ) {
      const getLikesQuery = `SELECT user.name AS name FROM user INNER JOIN like ON user.user_id=like.user_id WHERE like.tweet_id=${tweetId};`;
      const getLikes = await db.all(getLikesQuery);
      const usersList = [];
      for (let obj of getLikes) {
        usersList.push(obj.name);
      }
      response.send(usersList);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
//If the user requests a tweet of a user he is following, return the list of replies.
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const username = request.username;
    const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
    const userDetails = await db.get(getUserIdQuery);
    const userId = userDetails.user_id;

    const userFollowingQuery = `SELECT * FROM user INNER JOIN follower ON user.user_id=follower.following_user_id WHERE follower.follower_user_id;`;
    const userFollowers = await db.all(userFollowingQuery);

    const tweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetResult = await db.get(tweetQuery);

    if (
      userFollowers.some(
        (item) => tweetResult.user_id === item.following_user_id
      )
    ) {
      const getrepliesQuery = `SELECT user.name AS name,reply.reply AS reply FROM user INNER JOIN reply ON user.user_id=reply.user_id WHERE reply.tweet_id=${tweetId};`;
      const getReplies = await db.all(getrepliesQuery);
      response.send(getReplies);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserIdQuery);
  const userId = userDetails.user_id;

  const getAllUserTweetsQuery = `SELECT * FROM tweet WHERE user_id=${userId};`;
  const userTweets = await db.all(getAllUserTweetsQuery);

  let allUserTweets = [];

  for (let obj of userTweets) {
    const getLikesQuery = `SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id=${obj.tweet_id} GROUP BY tweet_id;`;
    const likesObject = await db.get(getLikesQuery);

    const getRepliesQuery = `SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id=${obj.tweet_id} GROUP BY tweet_id;`;
    const repliesObject = await db.get(getRepliesQuery);

    let userTweet = {
      tweet: obj.tweet,
      likes: likesObject.likes,
      replies: repliesObject.replies,
      dateTime: obj.date_time,
    };
    allUserTweets.append(userTweet);
  }
  response.send(allUserTweets);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;

  const username = request.username;
  const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
  const userDetails = await db.get(getUserIdQuery);
  const userId = userDetails.user_id;

  const d = new Date();
  const addTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time) VALUES(
        '${tweet}',${userId},'${d}'
    );`;
  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const username = request.username;
    const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
    const userDetails = await db.get(getUserIdQuery);
    const userId = userDetails.user_id;

    const { tweetId } = request.params;
    console.log(tweetId);

    const tweetUserQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetUser = await db.get(tweetUserQuery);
    console.log(tweetUser);
    if (tweetUser.user_id === userId) {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
