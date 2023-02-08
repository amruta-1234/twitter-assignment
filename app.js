const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
};

initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const isGetUserQuery = `
        SELECT *
        FROM user
        WHERE
            username = "${username}";`;
  const dbUser = await db.get(isGetUserQuery);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const registerUserQuery = `
                INSERT INTO 
                    user(username,password,name,gender)
                VALUES("${username}","${hashedPassword}","${name}","${gender}");`;
      const dbResponse = await db.run(registerUserQuery);
      const newUserId = dbResponse.lastID;
      response.status(200);
      response.send("User created successfully");
    }
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
        SELECT *
        FROM user
        WHERE
            username="${username}";`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "abcdefgh");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
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

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE
            username="${username}";`;
  const DbuserId = await db.get(getUserIdQuery);
  const userId = DbuserId.user_id;

  const getTweetsQuery = `
        SELECT 
            user.username AS username,
            tweet.tweet AS tweet,
            tweet.date_time AS dateTime
        FROM (follower
            INNER JOIN tweet
        ON tweet.user_id = follower.following_user_id) AS T
        INNER JOIN user
        ON T.following_user_id= user.user_id
        WHERE
            follower.follower_user_id = "${userId}"
        ORDER BY 
            tweet.date_time	 DESC
        LIMIT 4;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
        SELECT name
        FROM user
        WHERE
            username="${username}";`;
  const DbuserId = await db.get(getUserIdQuery);
  const userId = DbuserId.user_id;

  const getFollowingQuery = `
    SELECT 
        user.name AS name
    FROM follower
        INNER JOIN user
    ON follower.following_user_id = user.user_id
    WHERE
        follower.follower_user_id = "${userId}";`;
  const getFollowing = await db.all(getFollowingQuery);
  response.send(getFollowing);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE
            username="${username}";`;
  const DbuserId = await db.get(getUserIdQuery);
  const userId = DbuserId.user_id;

  const getFollowersQuery = `
    SELECT user.name AS name
    FROM user
        INNER JOIN follower
    ON user.user_id = follower.follower_user_id
    WHERE
        follower.following_user_id="${userId}";`;

  const followingArray = await db.all(getFollowersQuery);
  response.send(followingArray);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;

  const { tweetId } = request.params;

  const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE
            username="${username}";`;
  const DbuserId = await db.get(getUserIdQuery);
  const userId = DbuserId.user_id;

  const getTweetsQuery = `
    SELECT *
    FROM tweet
        INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id="${userId}"
        AND tweet.tweet_id = "${tweetId}";`;
  const tweetArray = await db.all(getTweetsQuery);
  console.log(tweetArray);

  if (tweetArray === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getStatisticQuery = `
        SELECT 
            tweet.tweet AS tweet,
            COUNT(like.like_id) AS likes,
            COUNT(reply.reply_id) AS replies,
            tweet.date_time AS dateTime
        FROM (tweet
            INNER JOIN reply
        ON tweet.tweet_id = reply.tweet_id) AS T
            INNER JOIN like 
        ON T.tweet_id = like.tweet_id
        WHERE 
            tweet.tweet_id = "${tweetId}"
        GROUP BY 
            tweet.tweet_id;`;
    const statistics = await db.get(getStatisticQuery);
    response.send(statistics);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;

    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE
            username="${username}";`;
    const DbuserId = await db.get(getUserIdQuery);
    const userId = DbuserId.user_id;

    const getTweetsQuery = `
    SELECT *
    FROM tweet
        INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id="${userId}"
        AND tweet.tweet_id = "${tweetId}";`;
    const tweetArray = await db.all(getTweetsQuery);

    if (tweetArray === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikedUsernameQuery = `
        SELECT user.username AS username
        FROM user 
            INNER JOIN like
        ON user.user_id = like.user_id
        WHERE 
            like.tweet_id = "${tweetId}";`;
      const likedUser = await db.all(getLikedUsernameQuery);
      const likesArray = { likes: likedUser };
      response.send(likesArray);
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;

    const { tweetId } = request.params;

    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE
            username="${username}";`;
    const DbuserId = await db.get(getUserIdQuery);
    const userId = DbuserId.user_id;

    const getTweetsQuery = `
    SELECT *
    FROM tweet
        INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE 
        follower.follower_user_id="${userId}"
        AND tweet.tweet_id = "${tweetId}";`;
    const tweetArray = await db.all(getTweetsQuery);

    if (tweetArray === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getReplyQuery = `
        SELECT 
            user.name AS name,
            reply.reply AS reply
        FROM reply 
        INNER JOIN user
        ON reply.user_id = user.user_id
        WHERE 
            reply.tweet_id = "${tweetId}"
        GROUP BY 
            reply.tweet_id;`;
      const replyArray = await db.all(getReplyQuery);
      const listReplies = { replies: replyArray };
      response.send(listReplies);
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE
            username="${username}";`;
  const DbuserId = await db.get(getUserIdQuery);
  const userId = DbuserId.user_id;

  const getTweetsQuery = `
        SELECT 
            tweet.tweet AS tweet,
            COUNT(like.like_id) AS likes,
            COUNT(reply.reply_id) AS replies,
            tweet.date_time AS dateTime
        FROM (tweet 
            INNER JOIN like
        ON tweet.tweet_id = like.tweet_id) AS T
        INNER JOIN reply
        ON reply.tweet_id = T.tweet_id
        WHERE 
            tweet.user_id = "${userId}"
        GROUP BY 
            tweet.tweet_id;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE
            username="${username}";`;
  const DbuserId = await db.get(getUserIdQuery);
  const userId = DbuserId.user_id;

  const { tweet } = request.body;

  const dateTime = new Date();

  const createTweetQuery = `
        INSERT INTO 
            tweet(tweet,user_id,date_time)
        VALUES
            ("${tweet}","${userId}","${dateTime}");`;
  const dbResponse = await db.run(createTweetQuery);
  const tweetId = dbResponse.lastID;
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const getUserIdQuery = `
        SELECT user_id
        FROM user
        WHERE
            username="${username}";`;
    const DbuserId = await db.get(getUserIdQuery);
    const userId = DbuserId.user_id;

    const tweetOfUser = `
    SELECT * 
    FROM tweet
    WHERE
        user_id = "${userId}"
        AND tweet_id="${tweetId}";`;
    const tweetArray = await db.get(tweetOfUser);

    if (tweetArray === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
            DELETE FROM 
                tweet
            WHERE
                tweet_id="${tweetId}";`;
      const dbResponse = await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
