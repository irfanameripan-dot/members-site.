const SUPABASE_URL = "https://kpetqyojjppgbvmhbwzh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZXRxeW9qanBwZ2J2bWhid3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMDIyNTQsImV4cCI6MjEwNjg3ODI1NH0.9VbAUZ7yE47gCT4UEMyrxQdNcBMLBdb_GJF1ivsfq4Y";

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
const resendVerificationButton = document.getElementById("resend-verification-button");

let pendingVerificationEmail = "";
let currentUser = null;
let currentUsername = "member";

function showStatus(message, isError = false) {
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
    return;
  }

  currentUsername = data.username;
  document.getElementById("current-username").textContent = currentUsername;
}

async function loadPosts() {
  postList.replaceChildren();

  const { data: posts, error: postsError } = await supabaseClient
    .from("posts")
    .select("id, author_id, content, created_at")
    .order("created_at", { ascending: false });

  if (postsError) {
    console.error(postsError);
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
    console.error(profilesError);
    showStatus("Posts loaded, but member names could not be loaded.", true);
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

    if (post.author_id === currentUser.id) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-post-button";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deletePost(post.id));
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

document
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

    showStatus("Creating your account…");

    const redirectUrl = window.location.origin + window.location.pathname;

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: redirectUrl
      }
    });

    if (error) {
      console.error(error);
      showStatus(error.message, true);
      return;
    }

    if (data.session) {
      verificationPanel.classList.add("hidden");
      showStatus("Your account is ready. Welcome!");
      await showSignedInApp(data.user);
      return;
    }

    pendingVerificationEmail = email;

    verificationMessage.textContent =
      `We sent a verification link to ${email}. Open that email and click the link before logging in. If you don’t see it, check your spam or junk folder.`;

    verificationPanel.classList.remove("hidden");
    showStatus("");
  });

    if (error) {
      console.error(error);

      if (error.message.toLowerCase().includes("username")) {
        showStatus(
          "That username may already be taken, or it does not meet the username rules. Try another.",
          true
        );
      } else {
        showStatus(error.message, true);
      }

      return;
    }

    if (data.session) {
      showStatus("Account created. You are now logged in.");
      await showSignedInApp(data.user);
    } else {
      showStatus(
        "Account created. Check your email and confirm your account, then log in."
      );
    }
  });

document
  .getElementById("login-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    showStatus("Logging in…");

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error(error);
      showStatus("Could not log in. Check your email and password.", true);
      return;
    }

    showStatus("");
verificationPanel.classList.add("hidden");
await showSignedInApp(data.user);
  });

document
  .getElementById("forgot-password-button")
  .addEventListener("click", async () => {
    const email = document.getElementById("login-email").value.trim();

    if (!email) {
      showStatus("Enter your email in the login form first.", true);
      return;
    }

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href
    });

    if (error) {
      console.error(error);
      showStatus("Could not send a password reset email.", true);
      return;
    }

    showStatus("If that email has an account, a password reset email has been sent.");
  });

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

    const { error } = await supabaseClient
      .from("posts")
      .insert({
        author_id: currentUser.id,
        content
      });

    submitButton.disabled = false;
    submitButton.textContent = "Publish post";

    if (error) {
      console.error(error);
      showStatus("Could not publish the post. Please try again.", true);
      return;
    }

    input.value = "";
    showStatus("Your post was published.");
    await loadPosts();
  });

async function deletePost(postId) {
  const confirmed = window.confirm("Delete your post?");
  if (!confirmed || !currentUser) return;

  const { error } = await supabaseClient
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", currentUser.id);

  if (error) {
    console.error(error);
    showStatus("Could not delete that post.", true);
    return;
  }

  showStatus("Post deleted.");
  await loadPosts();
}

document.getElementById("logout-button").addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error(error);
    showStatus("Could not log out. Please try again.", true);
    return;
  }

  showSignedOutApp();
  showStatus("You are logged out.");
});

document
  .getElementById("refresh-posts-button")
  .addEventListener("click", loadPosts);

async function initialize() {
  if (
    SUPABASE_URL.includes("PASTE_") ||
    SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")
  ) {
    showStatus(
      "Add your Supabase Project URL and publishable key to app.js first.",
      true
    );
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error(error);
    showStatus("Could not check your login session.", true);
    return;
  }

  if (data.session?.user) {
    await showSignedInApp(data.session.user);
  } else {
    showSignedOutApp();
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      showSignedInApp(session.user);
    } else {
      showSignedOutApp();
    }
  });
}

initialize();