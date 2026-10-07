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
const myPostList = document.getElementById("my-post-list");

const verificationPanel = document.getElementById("verification-panel");
const verificationMessage = document.getElementById("verification-message");
const resendVerificationButton = document.getElementById(
  "resend-verification-button"
);

const postImageInput = document.getElementById("post-image");
const imagePreviewWrap = document.getElementById("image-preview-wrap");
const imagePreview = document.getElementById("image-preview");

const REACTION_EMOJIS = ["❤️", "😊", "😂", "👍", "🎉"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_BUCKET = "post-images";

let currentUser = null;
let pendingVerificationEmail = "";
let selectedImageFile = null;
let previewObjectUrl = null;

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

function getRedirectUrl() {
  return window.location.origin + window.location.pathname;
}

function escapeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

async function loadCurrentProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Could not load profile:", error);
    document.getElementById("current-username").textContent = "member";
    return;
  }

  document.getElementById("current-username").textContent =
    data.username || "member";
}

async function signedImageUrl(imagePath) {
  if (!imagePath) return null;

  const { data, error } = await supabaseClient.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(imagePath, 60 * 60);

  if (error) {
    console.error("Could not create image link:", error);
    return null;
  }

  return data.signedUrl;
}

function createCommentElement(comment, username, isOwnComment, onDelete) {
  const item = document.createElement("article");
  item.className = "comment";

  const meta = document.createElement("div");
  meta.className = "comment-meta";

  const author = document.createElement("strong");
  author.className = "comment-author";
  author.textContent = username || "Member";

  meta.appendChild(author);

  if (isOwnComment) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "comment-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", onDelete);
    meta.appendChild(deleteButton);
  }

  const text = document.createElement("p");
  text.className = "comment-text";
  text.textContent = comment.content;

  const time = document.createElement("small");
  time.className = "post-date";
  time.textContent = formatDate(comment.created_at);

  item.append(meta, text, time);
  return item;
}

function makeReactionButton(postId, emoji, reactions) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "reaction-button";

  const forThisEmoji = reactions.filter((reaction) => reaction.emoji === emoji);
  const chosenByMe = forThisEmoji.some(
    (reaction) => reaction.user_id === currentUser.id
  );

  button.classList.toggle("selected", chosenByMe);
  button.textContent = `${emoji} ${forThisEmoji.length || ""}`.trim();
  button.dataset.count = String(forThisEmoji.length);
button.dataset.emoji = emoji;
  button.setAttribute(
    "aria-label",
    `${emoji} reaction, ${forThisEmoji.length} reactions`
  );

 button.addEventListener("click", async () => {
  if (button.disabled) return;

  button.classList.remove("is-animating");
  void button.offsetWidth; // Restart the animation on each tap.
  button.classList.add("is-animating");

  await toggleReaction(postId, emoji, button);
});

  return button;
}

async function renderPost(post, username, comments, reactions, profilesById) {
  const card = document.createElement("article");
  card.className = "post-card";
card.dataset.postId = String(post.id);

  const header = document.createElement("div");
  header.className = "post-header";

  const authorBlock = document.createElement("div");

  const author = document.createElement("p");
  author.className = "post-author";
  author.textContent = username || "Member";

  const date = document.createElement("time");
  date.className = "post-date";
  date.dateTime = post.created_at;
  date.textContent = formatDate(post.created_at);

  authorBlock.append(author, date);
  header.appendChild(authorBlock);

  if (post.author_id === currentUser.id) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-post-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete post";
    deleteButton.addEventListener("click", () => deletePost(post));
    header.appendChild(deleteButton);
  }

  const content = document.createElement("p");
  content.className = "post-content";
  content.textContent = post.content;

  card.append(header, content);

  if (post.image_path) {
    const imageUrl = await signedImageUrl(post.image_path);

    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "post-image";
      image.src = imageUrl;
      image.alt = `Picture attached to ${username || "member"}'s post`;
      image.loading = "lazy";
      card.appendChild(image);
    }
  }

  const actionRow = document.createElement("div");
  actionRow.className = "post-actions";

  const postReactions = reactions.filter(
    (reaction) => reaction.post_id === post.id
  );

  REACTION_EMOJIS.forEach((emoji) => {
    actionRow.appendChild(
      makeReactionButton(post.id, emoji, postReactions)
    );
  });

  card.appendChild(actionRow);

  const commentList = document.createElement("div");
  commentList.className = "comment-list";

  const postComments = comments.filter(
    (comment) => comment.post_id === post.id
  );

  postComments.forEach((comment) => {
    const commentUsername = profilesById.get(comment.author_id) || "Member";
    const ownComment = comment.author_id === currentUser.id;

    commentList.appendChild(
      createCommentElement(
        comment,
        commentUsername,
        ownComment,
        () => deleteComment(comment.id)
      )
    );
  });

  if (postComments.length === 0) {
    const noComments = document.createElement("small");
    noComments.className = "post-date";
    noComments.textContent = "No comments yet.";
    commentList.appendChild(noComments);
  }

  card.appendChild(commentList);

  const commentForm = document.createElement("form");
  commentForm.className = "comment-form";

  const commentInput = document.createElement("input");
  commentInput.type = "text";
  commentInput.maxLength = 1000;
  commentInput.placeholder = "Write a comment…";
  commentInput.setAttribute("aria-label", "Write a comment");
  commentInput.required = true;

  const commentButton = document.createElement("button");
  commentButton.type = "submit";
  commentButton.textContent = "Comment";

  commentForm.append(commentInput, commentButton);

 commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  commentButton.disabled = true;
  commentButton.textContent = "Sending…";

  await addComment(post.id, commentInput.value);

  commentButton.disabled = false;
  commentButton.textContent = "Comment";
});

  card.appendChild(commentForm);
  return card;
}

async function loadPosts() {
  const { data: posts, error: postsError } = await supabaseClient
    .from("posts")
    .select("id, author_id, content, image_path, created_at")
    .order("created_at", { ascending: false });

  if (postsError) {
    console.error("Could not load posts:", postsError);
    showStatus("Could not load posts. Please try refreshing.", true);
    return;
  }

  if (!posts || posts.length === 0) {
    const emptyFeed = document.createElement("div");
    emptyFeed.className = "empty-state";
    emptyFeed.textContent = "No posts yet. You can write the first one!";

    const emptyMine = document.createElement("div");
    emptyMine.className = "empty-state";
    emptyMine.textContent = "You haven’t shared a post yet.";

    postList.replaceChildren(emptyFeed);
    myPostList.replaceChildren(emptyMine);
    return;
  }

  const postIds = posts.map((post) => post.id);
  const profileIds = [...new Set(posts.map((post) => post.author_id))];

  const [profilesResult, commentsResult, reactionsResult] = await Promise.all([
    supabaseClient
      .from("profiles")
      .select("id, username")
      .in("id", profileIds),

    supabaseClient
      .from("comments")
      .select("id, post_id, author_id, content, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true }),

    supabaseClient
      .from("post_reactions")
      .select("id, post_id, user_id, emoji")
      .in("post_id", postIds)
  ]);

  if (profilesResult.error) console.error(profilesResult.error);
  if (commentsResult.error) console.error(commentsResult.error);
  if (reactionsResult.error) console.error(reactionsResult.error);

  const profiles = profilesResult.data || [];
  const comments = commentsResult.data || [];
  const reactions = reactionsResult.data || [];

  const commentAuthorIds = [
    ...new Set(comments.map((comment) => comment.author_id))
  ];

  const missingProfileIds = commentAuthorIds.filter(
    (id) => !profiles.some((profile) => profile.id === id)
  );

  let commentProfiles = [];

  if (missingProfileIds.length > 0) {
    const result = await supabaseClient
      .from("profiles")
      .select("id, username")
      .in("id", missingProfileIds);

    if (!result.error) {
      commentProfiles = result.data || [];
    }
  }

  const profilesById = new Map(
    [...profiles, ...commentProfiles].map((profile) => [
      profile.id,
      profile.username
    ])
  );

  async function renderPostList(target, postsToShow, emptyText) {
    if (postsToShow.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      target.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const post of postsToShow) {
      const card = await renderPost(
        post,
        profilesById.get(post.author_id) || "Member",
        comments,
        reactions,
        profilesById
      );

      fragment.appendChild(card);
    }

    target.replaceChildren(fragment);
  }

  // Keep the full list in the Community Feed.
  await renderPostList(
    postList,
    posts,
    "No posts yet. You can write the first one!"
  );

  // Show only the signed-in member’s posts in My Posts.
  const ownPosts = posts.filter(
    (post) => post.author_id === currentUser.id
  );

  await renderPostList(
    myPostList,
    ownPosts,
    "You haven’t shared a post yet. Create one in the Community Feed."
  );
}

async function showSignedInApp(user) {
  currentUser = user;
  authPanel.classList.add("hidden");
  memberPanel.classList.remove("hidden");
  verificationPanel.classList.add("hidden");

  await loadCurrentProfile(user.id);
  await loadPosts();
}

function showSignedOutApp() {
  currentUser = null;
  authPanel.classList.remove("hidden");
  memberPanel.classList.add("hidden");
  postList.replaceChildren();
}

function showAuthForm(formName) {
  const showingLogin = formName === "login";

  document.getElementById("login-form").classList.toggle("hidden", !showingLogin);
  document.getElementById("register-form").classList.toggle("hidden", showingLogin);
  verificationPanel.classList.add("hidden");

  document.getElementById("auth-heading").textContent =
    showingLogin ? "Welcome back" : "Create your account";

  document.getElementById("show-login-button").classList.toggle(
    "active",
    showingLogin
  );

  document.getElementById("show-register-button").classList.toggle(
    "active",
    !showingLogin
  );

  clearStatus();
}

function clearImageSelection() {
  selectedImageFile = null;
  postImageInput.value = "";
  imagePreviewWrap.classList.add("hidden");

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  imagePreview.removeAttribute("src");
}

postImageInput.addEventListener("change", () => {
  clearStatus();

  const file = postImageInput.files[0];

  if (!file) {
    clearImageSelection();
    return;
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowedTypes.includes(file.type)) {
    clearImageSelection();
    showStatus("Choose a JPG, PNG, WEBP, or GIF image.", true);
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    clearImageSelection();
    showStatus("That image is larger than 5 MB. Choose a smaller image.", true);
    return;
  }

  selectedImageFile = file;

  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);

  previewObjectUrl = URL.createObjectURL(file);
  imagePreview.src = previewObjectUrl;
  imagePreviewWrap.classList.remove("hidden");
});

document.getElementById("remove-image-button").addEventListener("click", () => {
  clearImageSelection();
});

async function uploadSelectedImage() {
  if (!selectedImageFile) return null;

  const extension = selectedImageFile.name.includes(".")
    ? selectedImageFile.name.split(".").pop().toLowerCase()
    : "jpg";

  const safeOriginalName = escapeFileName(
    selectedImageFile.name.replace(/\.[^.]+$/, "")
  );

  const filePath =
    `${currentUser.id}/${crypto.randomUUID()}-${safeOriginalName}.${extension}`;

  const { error } = await supabaseClient.storage
    .from(IMAGE_BUCKET)
    .upload(filePath, selectedImageFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: selectedImageFile.type
    });

  if (error) throw error;

  return filePath;
}

document.getElementById("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  const username = document
    .getElementById("register-username")
    .value
    .trim()
    .toLowerCase();

  const email = document.getElementById("register-email").value.trim();
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

  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Creating account…";

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: getRedirectUrl()
      }
    });

    if (error) {
      showStatus(error.message, true);
      return;
    }

    if (data.session && data.user) {
      await showSignedInApp(data.user);
      showStatus("Your account is ready. Welcome!");
      return;
    }

    pendingVerificationEmail = email;
    verificationMessage.textContent =
      `We sent a verification link to ${email}. Open that email and click the link before logging in. Check your spam folder if you don’t see it.`;

    document.getElementById("login-form").classList.add("hidden");
    document.getElementById("register-form").classList.add("hidden");
    verificationPanel.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    showStatus("Could not create your account. Please try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Create account";
  }
});

resendVerificationButton.addEventListener("click", async () => {
  if (!pendingVerificationEmail) {
    showStatus("Register first to request a verification email.", true);
    return;
  }

  resendVerificationButton.disabled = true;
  resendVerificationButton.textContent = "Sending…";

  const { error } = await supabaseClient.auth.resend({
    type: "signup",
    email: pendingVerificationEmail,
    options: { emailRedirectTo: getRedirectUrl() }
  });

  resendVerificationButton.disabled = false;
  resendVerificationButton.textContent = "Resend verification email";

  if (error) {
    console.error(error);
    showStatus("Could not resend the email. Try again shortly.", true);
  } else {
    verificationMessage.textContent =
      `A new verification link was sent to ${pendingVerificationEmail}. Check your inbox and spam folder.`;
  }
});

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const button = event.currentTarget.querySelector('button[type="submit"]');

  button.disabled = true;
  button.textContent = "Signing in…";

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error(error);
      showStatus(
        "Could not log in. Check your email and password, and verify your email if required.",
        true
      );
      return;
    }

    await showSignedInApp(data.user);
    clearStatus();
  } catch (error) {
    console.error(error);
    showStatus("Could not log in. Please try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

document.getElementById("forgot-password-button").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim();

  if (!email) {
    showStatus("Enter your email first, then choose Forgot password.", true);
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: getRedirectUrl()
  });

  if (error) {
    console.error(error);
    showStatus("Could not send a password reset email.", true);
  } else {
    showStatus("If that email has an account, a password reset email has been sent.");
  }
});

document.getElementById("post-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  if (!currentUser) {
    showStatus("Please log in before posting.", true);
    return;
  }

  const content = document.getElementById("post-content").value.trim();

  if (!content) {
    showStatus("Please write something for your post.", true);
    return;
  }

  if (content.length > 2000) {
    showStatus("Posts can be up to 2,000 characters.", true);
    return;
  }

  const button = document.getElementById("publish-button");
  button.disabled = true;
  button.textContent = "Publishing…";

  let uploadedPath = null;

  try {
    uploadedPath = await uploadSelectedImage();

    const { error } = await supabaseClient
      .from("posts")
      .insert({
        author_id: currentUser.id,
        content,
        image_path: uploadedPath
      });

    if (error) throw error;

    document.getElementById("post-content").value = "";
    clearImageSelection();
    showStatus("Your post was published.");
    await loadPosts();
  } catch (error) {
    console.error("Could not publish post:", error);

    if (uploadedPath) {
      await supabaseClient.storage
        .from(IMAGE_BUCKET)
        .remove([uploadedPath]);
    }

    showStatus(
      "Could not publish your post. Check the database/storage setup and try again.",
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = "Publish post";
  }
});

async function toggleReaction(postId, emoji, clickedButton) {
  const wasSelected = clickedButton.classList.contains("selected");
  const buttons = [];

  // Find the matching reaction in the feed and My Posts views.
  document
    .querySelectorAll(`.post-card[data-post-id="${postId}"] .reaction-button`)
    .forEach((button) => {
      if (button.dataset.emoji === emoji) {
        buttons.push(button);
      }
    });

  const oldStates = buttons.map((button) => ({
    button,
    count: Number(button.dataset.count || 0),
    selected: button.classList.contains("selected")
  }));

  // Update the displayed reaction immediately, without rebuilding the feed.
  buttons.forEach((button) => {
    const oldCount = Number(button.dataset.count || 0);
    const newCount = Math.max(0, oldCount + (wasSelected ? -1 : 1));

    button.dataset.count = String(newCount);
    button.classList.toggle("selected", !wasSelected);
    button.textContent = `${emoji} ${newCount || ""}`.trim();
  });

  buttons.forEach((button) => {
    button.disabled = true;
  });

  let result;

  if (wasSelected) {
    result = await supabaseClient
      .from("post_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", currentUser.id)
      .eq("emoji", emoji);
  } else {
    result = await supabaseClient
      .from("post_reactions")
      .insert({
        post_id: postId,
        user_id: currentUser.id,
        emoji
      });
  }

  if (result.error) {
    console.error("Reaction error:", result.error);

    // Restore the previous display if Supabase couldn't save the reaction.
    oldStates.forEach(({ button, count, selected }) => {
      button.dataset.count = String(count);
      button.classList.toggle("selected", selected);
      button.textContent = `${emoji} ${count || ""}`.trim();
    });

    showStatus("Could not save that reaction. Please try again.", true);
  }

  buttons.forEach((button) => {
    button.disabled = false;
  });
}

async function addComment(postId, rawContent) {
  const content = rawContent.trim();

  if (!content) {
    showStatus("Write a comment first.", true);
    return;
  }

  if (content.length > 1000) {
    showStatus("Comments can be up to 1,000 characters.", true);
    return;
  }

  const { data: newComment, error } = await supabaseClient
    .from("comments")
    .insert({
      post_id: postId,
      author_id: currentUser.id,
      content
    })
    .select("id, post_id, author_id, content, created_at")
    .single();

  if (error) {
    console.error("Comment error:", error);
    showStatus("Could not add your comment. Please try again.", true);
    return;
  }

  // Update the comment section in both views without reloading the posts.
  const matchingCards = document.querySelectorAll(
    `.post-card[data-post-id="${postId}"]`
  );

  matchingCards.forEach((card) => {
    const commentList = card.querySelector(".comment-list");
    if (!commentList) return;

    // Remove the empty-state message when the first comment is added.
    const emptyMessage = Array.from(commentList.children).find(
      (child) => child.textContent.trim() === "No comments yet."
    );

    if (emptyMessage) {
      emptyMessage.remove();
    }

    const comment = document.createElement("article");
    comment.className = "comment";

    const meta = document.createElement("div");
    meta.className = "comment-meta";

    const author = document.createElement("strong");
    author.className = "comment-author";
    author.textContent =
      document.getElementById("current-username").textContent || "Member";

    const deleteButton = document.createElement("button");
    deleteButton.className = "comment-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteComment(newComment.id));

    meta.append(author, deleteButton);

    const commentText = document.createElement("p");
    commentText.className = "comment-text";
    commentText.textContent = newComment.content;

    const time = document.createElement("small");
    time.className = "post-date";
    time.textContent = formatDate(newComment.created_at);

    comment.append(meta, commentText, time);
    commentList.appendChild(comment);
  });

  // Clear the submitted comment box(es) for that post.
  matchingCards.forEach((card) => {
    const input = card.querySelector(".comment-form input");
    if (input) input.value = "";
  });

  clearStatus();
}

async function deleteComment(commentId) {
  if (!window.confirm("Delete your comment?")) return;

  const { error } = await supabaseClient
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("author_id", currentUser.id);

  if (error) {
    console.error("Delete comment error:", error);
    showStatus("Could not delete your comment.", true);
    return;
  }

  await loadPosts();
}

async function deletePost(post) {
  if (!window.confirm("Delete this post? Its comments and reactions will also be removed.")) {
    return;
  }

  const { error } = await supabaseClient
    .from("posts")
    .delete()
    .eq("id", post.id)
    .eq("author_id", currentUser.id);

  if (error) {
    console.error("Delete post error:", error);
    showStatus("Could not delete that post.", true);
    return;
  }

  if (post.image_path) {
    const { error: imageError } = await supabaseClient.storage
      .from(IMAGE_BUCKET)
      .remove([post.image_path]);

    if (imageError) console.error("Could not remove attached image:", imageError);
  }

  showStatus("Post deleted.");
  await loadPosts();
}

/* Sign-in and sign-up form switching */
function showAuthForm(formName) {
  const login = formName === "login";

  document.getElementById("login-form").classList.toggle("hidden", !login);
  document.getElementById("register-form").classList.toggle("hidden", login);
  verificationPanel.classList.add("hidden");

  document.getElementById("auth-heading").textContent =
    login ? "Welcome back" : "Create your account";

  document.getElementById("show-login-button").classList.toggle("active", login);
  document.getElementById("show-register-button").classList.toggle("active", !login);

  clearStatus();
}

document.getElementById("show-login-button").addEventListener("click", () => {
  showAuthForm("login");
});

document.getElementById("show-register-button").addEventListener("click", () => {
  showAuthForm("register");
});

document.getElementById("login-to-register-link").addEventListener("click", () => {
  showAuthForm("register");
});

document.getElementById("register-to-login-link").addEventListener("click", () => {
  showAuthForm("login");
});

document.getElementById("remove-image-button").addEventListener("click", () => {
  clearImageSelection();
});

document.getElementById("refresh-posts-button").addEventListener("click", loadPosts);

document.getElementById("logout-button").addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error(error);
    showStatus("Could not log out. Please try again.", true);
    return;
  }

  showSignedOutApp();
  clearStatus();
});

async function initialize() {
  if (
    SUPABASE_URL.includes("PASTE_") ||
    SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")
  ) {
    showStatus("Add your Supabase URL and publishable key to app.js.", true);
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
    if (session?.user && (!currentUser || currentUser.id !== session.user.id)) {
      showSignedInApp(session.user);
    } else if (!session?.user && currentUser) {
      showSignedOutApp();
    }
  });
}

function showMemberView(viewName) {
  document.querySelectorAll(".member-tab-button").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.memberView === viewName
    );
  });

  document.getElementById("feed-view").classList.toggle(
    "hidden",
    viewName !== "feed"
  );

  document.getElementById("my-posts-view").classList.toggle(
    "hidden",
    viewName !== "my-posts"
  );
}

document.querySelectorAll(".member-tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    showMemberView(button.dataset.memberView);
  });
});

document
  .getElementById("refresh-my-posts-button")
  .addEventListener("click", loadPosts);

initialize();
