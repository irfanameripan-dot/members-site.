const SUPABASE_URL = "https://kpetqyojjppgbvmhbwzh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZXRxeW9qanBwZ2J2bWhid3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMDIyNTQsImV4cCI6MjEwNjg3ODI1NH0.9VbAUZ7yE47gCT4UEMyrxQdNcBMLBdb_GJF1ivsfq4Y";
// Keep the Supabase Project URL and publishable/anon key
// from your current app.js. Do not use a service_role or secret key.

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const statusElement = document.getElementById("status");
const authPanel = document.getElementById("auth-panel");
const memberPanel = document.getElementById("member-panel");
const postList = document.getElementById("post-list");

const verificationPanel = document.getElementById("verification-panel");
const verificationMessage = document.getElementById("verification-message");
const resendVerificationButton = document.getElementById(
  "resend-verification-button"
);

let pendingVerificationEmail = "";
let currentUser = null;
let currentUsername = "member";

function showStatus(message, isError = false) {
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

function clearStatus() {
  showStatus("");
}

function usernameIsValid(username) {
  return /^[a-z0-9_]{3,20}$/.test(username);
}

async function loadCurrentProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Could not load profile:", error);
    currentUsername = "member";
  } else {
    currentUsername = data.username || "member";
  }

  const usernameElement = document.getElementById("current-username");

  if (usernameElement) {
    usernameElement.textContent = currentUsername;
  }
}

async function loadPosts() {
  postList.replaceChildren();

  const { data: posts, error: postsError } = await supabaseClient
    .from("posts")
    .select("id, author_id, content, created_at")
    .order("created_at", { ascending: false });

  if (postsError) {
    console.error("Could not load posts:", postsError);
    showStatus("Could not load posts. Please try refreshing.", true);
    return;
  }

  if (!posts || posts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No posts yet. You can write the first one!";
    postList.appendChild(empty);
    return;
  }

  const authorIds = [...new Set(posts.map((post) => post.author_id))];

  const { data: profiles, error: profilesError } = await supabaseClient
    .from("profiles")
    .select("id, username")
    .in("id", authorIds);

  if (profilesError) {
    console.error("Could not load member names:", profilesError);
  }

  const usernames = new Map(
    (profiles || []).map((profile) => [profile.id, profile.username])
  );

  posts.forEach((post) => {
    const card = document.createElement("article");
    card.className = "post-card";

    const header = document.createElement("div");
    header.className = "post-header";

    const authorDetails = document.createElement("div");

    const author = document.createElement("p");
    author.className = "post-author";
    author.textContent = usernames.get(post.author_id) || "Member";

    const date = document.createElement("time");
    date.className = "post-date";
    date.dateTime = post.created_at;
    date.textContent = new Date(post.created_at).toLocaleString();

    authorDetails.append(author, date);
    header.appendChild(authorDetails);

    if (currentUser && post.author_id === currentUser.id) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-post-button";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";

      deleteButton.addEventListener("click", () => {
        deletePost(post.id);
      });

      header.appendChild(deleteButton);
    }

    const content = document.createElement("p");
    content.className = "post-content";
    content.textContent = post.content;

    card.append(header, content);
    postList.appendChild(card);
  });
}

async function showSignedInApp(user) {
  currentUser = user;

  authPanel.classList.add("hidden");
  memberPanel.classList.remove("hidden");

  if (verificationPanel) {
    verificationPanel.classList.add("hidden");
  }

  await loadCurrentProfile(user.id);
  await loadPosts();
}

function showSignedOutApp() {
  currentUser = null;
  currentUsername = "member";

  authPanel.classList.remove("hidden");
  memberPanel.classList.add("hidden");
  postList.replaceChildren();
}

/* REGISTER */
document
  .getElementById("register-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    const username = document
      .getElementById("register-username")
      .value
      .trim()
      .toLowerCase();

    const email = document
      .getElementById("register-email")
      .value
      .trim();

    const password = document.getElementById("register-password").value;

    if (!usernameIsValid(username)) {
      showStatus(
        "Username must be 3–20 characters and use only letters, numbers, or underscores.",
        true
      );
      return;
    }

    if (password.length < 8) {
      showStatus("Use a password with at least 8 characters.", true);
      return;
    }

    const submitButton = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    submitButton.disabled = true;
    submitButton.textContent = "Creating account…";
    showStatus("Creating your account…");

    try {
      const redirectUrl =
        window.location.origin + window.location.pathname;

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { username },
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        console.error("Registration error:", error);
        showStatus(error.message, true);
        return;
      }

      if (data.session && data.user) {
        showStatus("Your account is ready. Welcome!");
        await showSignedInApp(data.user);
        return;
      }

      pendingVerificationEmail = email;

      if (verificationMessage) {
        verificationMessage.textContent =
          `We sent a verification link to ${email}. Open that email and click the link before logging in. If you don’t see it, check your spam or junk folder.`;
      }

      if (verificationPanel) {
        verificationPanel.classList.remove("hidden");
      } else {
        showStatus(
          `Account created. Check ${email} and verify your email before logging in.`
        );
      }

      showStatus("");
    } catch (error) {
      console.error("Unexpected registration error:", error);
      showStatus("Registration failed. Please try again.", true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Register";
    }
  });

/* RESEND VERIFICATION EMAIL */
if (resendVerificationButton) {
  resendVerificationButton.addEventListener("click", async () => {
    if (!pendingVerificationEmail) {
      showStatus(
        "Register first, then you can request another verification email.",
        true
      );
      return;
    }

    resendVerificationButton.disabled = true;
    resendVerificationButton.textContent = "Sending…";

    try {
      const redirectUrl =
        window.location.origin + window.location.pathname;

      const { error } = await supabaseClient.auth.resend({
        type: "signup",
        email: pendingVerificationEmail,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) {
        console.error("Resend verification error:", error);
        showStatus(
          "Could not resend the email. Wait a moment and try again.",
          true
        );
        return;
      }

      if (verificationMessage) {
        verificationMessage.textContent =
          `A new verification link was sent to ${pendingVerificationEmail}. Check your inbox and spam folder.`;
      }
    } catch (error) {
      console.error("Unexpected resend error:", error);
      showStatus("Could not resend the email. Please try again.", true);
    } finally {
      resendVerificationButton.disabled = false;
      resendVerificationButton.textContent = "Resend verification email";
    }
  });
}

/* LOGIN */
document
  .getElementById("login-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    const email = document
      .getElementById("login-email")
      .value
      .trim();

    const password = document.getElementById("login-password").value;

    const submitButton = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    submitButton.disabled = true;
    submitButton.textContent = "Logging in…";
    showStatus("Checking your sign-in details…");

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error("Login error:", error);
        showStatus(
          "Could not log in. Check your email and password, and verify your email address if required.",
          true
        );
        return;
      }

      if (!data.user) {
        showStatus("Login did not return a user account. Please try again.", true);
        return;
      }

      await showSignedInApp(data.user);
      showStatus("");
    } catch (error) {
      console.error("Unexpected login error:", error);
      showStatus("Login failed. Please try again.", true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Log in";
    }
  });

/* PASSWORD RESET */
document
  .getElementById("forgot-password-button")
  .addEventListener("click", async () => {
    const email = document
      .getElementById("login-email")
      .value
      .trim();

    if (!email) {
      showStatus("Enter your email in the login form first.", true);
      return;
    }

    showStatus("Sending password reset email…");

    const redirectUrl =
      window.location.origin + window.location.pathname;

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });

    if (error) {
      console.error("Password reset error:", error);
      showStatus("Could not send the password reset email.", true);
      return;
    }

    showStatus(
      "If that email has an account, a password reset email has been sent."
    );
  });

/* CREATE A POST */
document
  .getElementById("post-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (!currentUser) {
      showStatus("Please log in before posting.", true);
      return;
    }

    const input = document.getElementById("post-content");
    const content = input.value.trim();

    if (!content) {
      showStatus("Write something before publishing.", true);
      return;
    }

    if (content.length > 2000) {
      showStatus("Posts must be 2,000 characters or fewer.", true);
      return;
    }

    const submitButton = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    submitButton.disabled = true;
    submitButton.textContent = "Publishing…";

    try {
      const { error } = await supabaseClient
        .from("posts")
        .insert({
          author_id: currentUser.id,
          content
        });

      if (error) {
        console.error("Post error:", error);
        showStatus("Could not publish the post. Please try again.", true);
        return;
      }

      input.value = "";
      showStatus("Your post was published.");
      await loadPosts();
    } catch (error) {
      console.error("Unexpected post error:", error);
      showStatus("Could not publish the post. Please try again.", true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Publish post";
    }
  });

/* DELETE YOUR OWN POST */
async function deletePost(postId) {
  if (!currentUser) return;

  const confirmed = window.confirm("Delete your post?");
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", currentUser.id);

  if (error) {
    console.error("Delete post error:", error);
    showStatus("Could not delete that post.", true);
    return;
  }

  showStatus("Post deleted.");
  await loadPosts();
}

/* LOG OUT */
document
  .getElementById("logout-button")
  .addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      console.error("Logout error:", error);
      showStatus("Could not log out. Please try again.", true);
      return;
    }

    showSignedOutApp();
    showStatus("You are logged out.");
  });

/* REFRESH POSTS */
document
  .getElementById("refresh-posts-button")
  .addEventListener("click", loadPosts);

/* RESTORE A PREVIOUS LOGIN */
async function initialize() {
  if (
    SUPABASE_URL.includes("PASTE_") ||
    SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")
  ) {
    showStatus("Add your Supabase URL and publishable key to app.js.", true);
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("Session error:", error);
      showStatus("Could not check your login session.", true);
      return;
    }

    if (data.session?.user) {
      await showSignedInApp(data.session.user);
    } else {
      showSignedOutApp();
    }
  } catch (error) {
    console.error("Initialization error:", error);
    showStatus("Could not connect to the members service.", true);
  }
}

function showAuthForm(formName) {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const heading = document.getElementById("auth-heading");
  const loginTab = document.getElementById("show-login-button");
  const registerTab = document.getElementById("show-register-button");

  const showingLogin = formName === "login";

  loginForm.classList.toggle("hidden", !showingLogin);
  registerForm.classList.toggle("hidden", showingLogin);

  heading.textContent = showingLogin ? "Welcome back" : "Create your account";

  loginTab.classList.toggle("active", showingLogin);
  registerTab.classList.toggle("active", !showingLogin);

  clearStatus();
}

document
  .getElementById("show-login-button")
  .addEventListener("click", () => showAuthForm("login"));

document
  .getElementById("show-register-button")
  .addEventListener("click", () => showAuthForm("register"));

document
  .getElementById("login-to-register-link")
  .addEventListener("click", () => showAuthForm("register"));

document
  .getElementById("register-to-login-link")
  .addEventListener("click", () => showAuthForm("login"));
  
initialize();
