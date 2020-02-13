const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const randtoken = require("rand-token");
const uid = randtoken.uid;
const { secretOrKey } = require("../../config/keys");
const mailgun = require("../../config/mailgun");
const getDefaults = require("../../config/defaults");
const verify = require("../../middleware/verifyActive");
const wrap = require("../../middleware/asyncWrapper");

//Load user model
const User = require("../../models/User");

//Load Input Validation
const validateRegisterInput = require("../../validation/register");
const validateLoginInput = require("../../validation/login");

let domain = "www.hawkhack.io";
if (process.env.NODE_ENV === "development") {
  domain = "localhost:3000";
}

//  @route  GET api/u/test
//  @desc   Test users route
//  @access Public
router.get("/test", (req, res) => {
  res.json({ msg: "Users Works" });
});

//  @route  GET api/u/test
//  @desc   Test users route
//  @access Public
router.get(
  "/testp",
  passport.authenticate("jwt", { session: false }),
  verify(),
  (req, res) => {
    res.json({ msg: "Users Works" });
  }
);

//  @route  GET api/u/
//  @desc   Return current user
//  @access Private
router.get(
  "/",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    res.json({
      email: req.user.email,
      isVerified: req.user.verified,
      role: req.user.role,
      date: req.user.date
    });
  }
);

//  @route  POST api/u/register
//  @desc   register user
//  @access Public
router.post("/register", (req, res) => {
  const { errors, isValid } = validateRegisterInput(req.body);
  const defaults = getDefaults();
  //check validation
  if (!isValid) {
    return res.status(400).json(errors);
  }

  //check if email exists
  User.findOne({ email: req.body.email }).then(user => {
    if (user) {
      errors.email = "Email already exists";
      return res.status(400).json(errors);
    } else {
      //create new user
      const newUser = new User({
        email: req.body.email,
        password: req.body.password
      });

      //generate email verification token
      newUser.verificationToken = uid(32);

      //hash password
      bcrypt.genSalt(13, (err, salt) => {
        bcrypt.hash(newUser.password, salt, (err, hash) => {
          if (err) throw err;
          newUser.password = hash;

          //save user to db
          newUser
            .save()
            .then(user => {
              //send email verification

              const data = {
                from: `${defaults.Event.name} <noreply@${defaults.Links.domain}>`,
                to: user.email,
                subject: `${defaults.Event.name} Please verify your email`,
                html: `<p>Hi,<br>Welcome to ${defaults.Event.name} ${defaults.Event.edition}. Please verify your email by clicking the link below.</p><p>${domain}/verify/${newUser.verificationToken}</p><p>If you did sign up for a ${defaults.Event.name} account please disregard this email.</p><p>Happy Hacking!<br>Team ${defaults.Event.name}</p>`
              };
              mailgun.messages().send(data, (err, body) => {
                if (err) {
                  console.log("mailgun error: ", err);
                  return res.status(500).json("error");
                }
                console.log(`verification email sent to ${data.to}`);
              });
              const payload = {
                id: user.id,
                email: user.email
              };
              //Sign Token
              jwt.sign(
                payload,
                secretOrKey,
                { expiresIn: 3600 },
                (err, token) => {
                  return res.status(200).json({
                    success: true,
                    token: "Bearer " + token
                  });
                }
              );
            })
            .catch(err => console.log(err));
        });
      });
    }
  });
});

//  @route  GET api/u/reverify
//  @desc   reset email confirmation
//  @access Private
router.get(
  "/reverify",
  passport.authenticate("jwt", { session: false }),
  wrap(async (req, res) => {
    const defaults = getDefaults();
    if (req.user.verified) {
      return res.status(400).json("user already verified");
    }
    const user = await User.findById(req.user.id).select("verificationToken email");
    console.log(user);
    const data = {
      from: `${defaults.Event.name} <noreply@${defaults.Links.domain}>`,
      to: req.user.email,
      subject: `${defaults.Event.name} Please verify your email`,
      html: `<p>Hi,<br>Welcome to ${defaults.Event.name} ${defaults.Event.edition}. Please verify your email by clicking the link below.</p><p>${domain}/verify/${user.verificationToken}</p><p>If you did sign up for a ${defaults.Event.name} account please disregard this email.</p><p>Happy Hacking!<br>Team ${defaults.Event.name}</p>`
    };
    mailgun.messages().send(data, (err, body) => {
      if (err) {
        console.log("mailgun error: ", err);
        return res.status(500).json("error");
      }
      console.log(`verification email sent to ${data.to}`);
      res.status(200).json({ success: true });
    });
  })
);

//  @route  POST api/u/login
//  @desc   login user
//  @access Public
router.post("/login", (req, res) => {
  const { errors, isValid } = validateLoginInput(req.body);
  //check validation
  if (!isValid) {
    return res.status(400).json(errors);
  }
  const email = req.body.email;
  const password = req.body.password;
  //Find user by email
  User.findOne({ email })
    .select("password")
    .then(user => {
      //check for user
      if (!user) {
        errors.email = "User not found";
        return res.status(404).json(errors);
      }

      //check password
      bcrypt.compare(password, user.password).then(isMatch => {
        if (isMatch) {
          //User mathed

          //Create JWT payload
          const payload = {
            id: user.id,
            email: user.email
          };

          //Sign Token
          jwt.sign(payload, secretOrKey, { expiresIn: 3600 }, (err, token) => {
            res.status(200).json({
              success: true,
              token: "Bearer " + token
            });
          });
        } else {
          errors.password = "Password incorrect";
          return res.status(400).json(errors);
        }
      });
    });
});

//  @route  POST api/u/changepw
//  @desc   Change user password
//  @access Private
router.post(
  "/changepw",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    var errors = {};
    var { newpw } = req.body;
    User.findOne({ email: req.user.email }).then(user => {
      if (!user) {
        errors.nouser = "user not found";
        return res.status(500).json(errors);
      }
      bcrypt.genSalt(13, (err, salt) => {
        bcrypt.hash(newpw, salt, (err, hash) => {
          if (err) throw err;
          if (user.password == hash) {
            errors.samepassword =
              "The password needs to be different than your current";
            return res.status(412).json(errors);
          }
          user.password = hash;
          user
            .save()
            .then(user => res.json(user))
            .catch(err => console.log(err));
        });
      });
    });
  }
);

//  @route  GET api/u/resetpw/:email
//  @desc   Send password reset token
//  @access Public
router.get("/resetpw/:email", (req, res) => {
  const email = req.params.email;
  const defaults = getDefaults();

  User.findOne({ email: email }).then(user => {
    //if no user, smile and nod.
    if (!user) {
      console.log(`user ${email} not found`);
      return res.status(200).json(`email sent to ${email}`);
    }
    const token = uid(64);
    user.passwordResetToken = token;
    user.save().then(() => {
      //send password reset link to email
      const data = {
        from: `${defaults.Event.name} <noreply@${defaults.Links.domain}>`,
        to: user.email,
        subject: `${defaults.Event.name} Password Reset`,
        html: `<p>Hi,<br>An account registered in ${defaults.Event.name} has issued a password reset. Clicking the link below to reset your password. </p><p>${domain}/reset/${token}</p><p>If you did not issue a password reset please disregard this email.</p><p>Happy Hacking!<br>Team ${defaults.Event.name}</p>`
      };
      mailgun.messages().send(data, (err, body) => {
        if (err) {
          console.log("mailgun error: ", err);
          return res.status(500).json("error");
        }
        console.log(`ResetPW email sent to ${data.to}`);
        res.status(200).json(`email sent to ${data.to}`);
      });
    });
  });
});

//  @route  POST api/u/resetpw/:token
//  @desc   Reset user password
//  @access Public
router.post("/resetpw/:token", (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  let errors = {}

  User.findOne({ passwordResetToken: token })
    .select("password passwordResetToken")
    .then(user => {
      try {
        if (!user) {
          console.log(`ResetPW no user with token ${token}`);
          throw new Error("Token is not valid");
        }

        bcrypt.genSalt(13, (err, salt) => {
          bcrypt.hash(password, salt, (err, hash) => {
            if (err) throw new Error(err);

            if (user.password == hash) {
              throw new Error("The password needs to be different than your current")
            }

            user.password = hash;
            // user.passwordResetToken = "";
            user
              .save()
              .then(() => {
                res.status(200).send({ success: true });
              })
              .catch(err => {
                throw new Error(err)
              });
          });
        });
      } catch (err) {
        console.log(err.message)
        return res.status(404).send({ error: err.message })
      }
  });    
});

router.get("/verify/:token", (req, res) => {
  //get token from parameters
  const token = req.params.token;
  console.log(token);
  //find user with this token
  User.findOne({ verificationToken: token })
    .select("verified verificationToken")
    .then(user => {
      if (!user) {
        //if no user then no such token exists
        return res.status(400).json("Invalid token");
      }
      //set verify flag to true
      user.verified = true;
      user.verificationToken = "";
      //save user and return success
      user.save().then(() => {
        res.status(200).json({ success: true });
      });
      Profile.findOne({ user: user.id }).then(profile => {
        const member = {
          name: profile.firstName,
          address: profile.email
        };
        mailgun
          .lists("subscribers@mg.hawkhack.io")
          .add({ members: member, subscribed: true });
      });
    });
});

module.exports = router;
