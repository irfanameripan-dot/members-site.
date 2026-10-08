const SUPABASE_URL = "https://kpetqyojjppgbvmhbwzh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZXRxeW9qanBwZ2J2bWhid3poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMDIyNTQsImV4cCI6MjEwNjg3ODI1NH0.9VbAUZ7yE47gCT4UEMyrxQdNcBMLBdb_GJF1ivsfq4Y";
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const IMAGE_BUCKET = "post-images";
const AVATAR_BUCKET = "profile-pictures";
const REACTION_EMOJIS = ["❤️", "😊", "😂", "👍", "🎉"];
const MAX_POST_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_AVATAR_SIZE = 3 * 1024 * 1024;

const statusElement = document.getElementById("status");
const authPanel = document.getElementById("auth-panel");
const memberPanel = document.getElementById("member-panel");
const postList = document.getElementById("post-list");
const myPostList = document.getElementById("my-post-list");
const notificationList = document.getElementById("notification-list");
const directory = document.getElementById("member-directory");

let currentUser = null;
let currentProfile = null;
let pendingVerificationEmail = "";
let selectedPostImage = null;
let selectedAvatarImage = null;
let currentPublicProfile = null;

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

function redirectUrl() {
  return window.location.origin + window.location.pathname;
}

function escapeFileName(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function setView(viewName) {
  document.querySelectorAll(".member-view").forEach((view) => {
    view.classList.toggle("hidden", view.id !== `${viewName}-view`);
  });

  document.querySelectorAll(".bottom-nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });

  if (viewName === "notifications") loadNotifications();
  if (viewName === "profile") loadOwnProfileAndDirectory();
  if (viewName === "feed" || viewName === "my-posts") loadPosts();
}

function signedStorageUrl(bucket, path) {
  if (!path) return Promise.resolve(null);

  return supabaseClient.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60)
    .then(({ data, error }) => {
      if (error) {
        console.error("Could not create image link:", error);
        return null;
      }
      return data.signedUrl;
    });
}

async function loadProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, bio, avatar_path, created_at")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Could not load profile:", error);
    return null;
  }

  return data;
}

async function setAvatarImage(imgElement, avatarPath, fallbackText) {
  imgElement.alt = fallbackText;

  if (!avatarPath) {
    imgElement.removeAttribute("src");
    imgElement.classList.add("avatar-placeholder");
    return;
  }

  const url = await signedStorageUrl(AVATAR_BUCKET, avatarPath);

  if (url) {
    imgElement.src = url;
    imgElement.classList.remove("avatar-placeholder");
  } else {
    imgElement.removeAttribute("src");
    imgElement.classList.add("avatar-placeholder");
  }
}

async function showSignedInApp(user) {
  currentUser = user;
  authPanel.classList.add("hidden");
  memberPanel.classList.remove("hidden");

  currentProfile = await loadProfile(user.id);

  document.getElementById("current-username").textContent =
    currentProfile?.username || "member";

  await loadUnreadNotificationCount();
  await loadPosts();
  setView("feed");
}

function showSignedOutApp() {
  currentUser = null;
  currentProfile = null;
  authPanel.classList.remove("hidden");
  memberPanel.classList.add("hidden");
  postList.replaceChildren();
  myPostList.replaceChildren();
  notificationList.replaceChildren();
}

function showAuthForm(which) {
  const isLogin = which === "login";

  document.getElementById("login-form").classList.toggle("hidden", !isLogin);
  document.getElementById("register-form").classList.toggle("hidden", isLogin);
  document.getElementById("verification-panel").classList.add("hidden");

  document.getElementById("auth-heading").textContent =
    isLogin ? "Welcome back" : "Create your account";

  document.getElementById("show-login-button").classList.toggle("active", isLogin);
  document.getElementById("show-register-button").classList.toggle("active", !isLogin);

  clearStatus();
}

/* ---------- Posts, reactions, comments ---------- */

async function loadPosts() {
  if (!currentUser) return;

  const { data: posts, error } = await supabaseClient
    .from("posts")
    .select("id, author_id, content, image_path, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load posts:", error);
    showStatus("Could not load posts. Please try refreshing.", true);
    return;
  }

  const postIds = (posts || []).map((post) => post.id);
  const authorIds = [...new Set((posts || []).map((post) => post.author_id))];

  let profiles = [];
  let comments = [];
  let reactions = [];

  if (postIds.length) {
    const [profilesResult, commentsResult, reactionsResult] = await Promise.all([
      supabaseClient
        .from("profiles")
        .select("id, username, avatar_path")
        .in("id", authorIds),

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

    profiles = profilesResult.data || [];
    comments = commentsResult.data || [];
    reactions = reactionsResult.data || [];
  }

  const commentAuthorIds = [...new Set(comments.map((comment) => comment.author_id))];
  const missingIds = commentAuthorIds.filter(
    (id) => !profiles.some((profile) => profile.id === id)
  );

  if (missingIds.length) {
    const result = await supabaseClient
      .from("profiles")
      .select("id, username, avatar_path")
      .in("id", missingIds);

    if (!result.error) profiles.push(...(result.data || []));
  }

  const profilesById = new Map(
    profiles.map((profile) => [profile.id, profile])
  );

  const ownPosts = (posts || []).filter(
    (post) => post.author_id === currentUser.id
  );

  await renderPostList(postList, posts || [], profilesById, comments, reactions);
  await renderPostList(myPostList, ownPosts, profilesById, comments, reactions);
}

async function renderPostList(target, posts, profilesById, comments, reactions) {
  if (!posts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = target === myPostList
      ? "You haven’t shared a post yet. Write one in the Feed."
      : "No posts yet. You can write the first one!";
    target.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const post of posts) {
    const authorProfile = profilesById.get(post.author_id);
    const card = await buildPostCard(
      post,
      authorProfile,
      profilesById,
      comments,
      reactions
    );
    fragment.appendChild(card);
  }

  target.replaceChildren(fragment);
}

async function buildPostCard(post, authorProfile, profilesById, comments, reactions) {
  const card = document.createElement("article");
  card.className = "post-card";
  card.dataset.postId = String(post.id);

  const header = document.createElement("div");
  header.className = "post-header";

  const authorArea = document.createElement("div");
  authorArea.className = "post-author-area";

  const authorButton = document.createElement("button");
  authorButton.className = "post-author";
  authorButton.type = "button";
  authorButton.textContent = authorProfile?.username || "Member";
  authorButton.addEventListener("click", () => openPublicProfile(post.author_id));

  const date = document.createElement("time");
  date.className = "post-date";
  date.dateTime = post.created_at;
  date.textContent = formatDate(post.created_at);

  authorArea.append(authorButton, date);
  header.appendChild(authorArea);

  if (post.author_id === currentUser.id) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-post-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deletePost(post));
    header.appendChild(deleteButton);
  }

  const content = document.createElement("p");
  content.className = "post-content";
  content.textContent = post.content;
  card.append(header, content);

  if (post.image_path) {
    const url = await signedStorageUrl(IMAGE_BUCKET, post.image_path);
    if (url) {
      const image = document.createElement("img");
      image.className = "post-image";
      image.src = url;
      image.alt = `Picture attached to ${authorProfile?.username || "member"}'s post`;
      image.loading = "lazy";
      card.appendChild(image);
    }
  }

  const postReactions = reactions.filter((item) => item.post_id === post.id);
  const actionRow = document.createElement("div");
  actionRow.className = "post-actions";

  REACTION_EMOJIS.forEach((emoji) => {
    const matches = postReactions.filter((item) => item.emoji === emoji);
    const mine = matches.some((item) => item.user_id === currentUser.id);
    const button = document.createElement("button");

    button.type = "button";
    button.className = `reaction-button${mine ? " selected" : ""}`;
    button.dataset.emoji = emoji;
    button.dataset.count = String(matches.length);
    button.textContent = `${emoji} ${matches.length || ""}`.trim();
    button.setAttribute("aria-label", `${emoji}, ${matches.length} reactions`);

    button.addEventListener("click", () => toggleReaction(post.id, emoji, button));
    actionRow.appendChild(button);
  });

  card.appendChild(actionRow);

  const commentList = document.createElement("div");
  commentList.className = "comment-list";

  const postComments = comments.filter((item) => item.post_id === post.id);

  if (!postComments.length) {
    const empty = document.createElement("small");
    empty.className = "post-date";
    empty.textContent = "No comments yet.";
    commentList.appendChild(empty);
  }

  postComments.forEach((comment) => {
    const commentProfile = profilesById.get(comment.author_id);
    commentList.appendChild(
      buildComment(comment, commentProfile, comment.author_id === currentUser.id)
    );
  });

  card.appendChild(commentList);

  const commentForm = document.createElement("form");
  commentForm.className = "comment-form";

  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 1000;
  input.placeholder = "Write a comment…";
  input.setAttribute("aria-label", "Write a comment");
  input.required = true;

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Comment";

  commentForm.append(input, button);
  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    await addComment(post, input.value);
    button.disabled = false;
  });

  card.appendChild(commentForm);
  return card;
}

function buildComment(comment, profile, isOwnComment) {
  const item = document.createElement("article");
  item.className = "comment";

  const header = document.createElement("div");
  header.className = "comment-header";

  const author = document.createElement("button");
  author.className = "comment-author";
  author.type = "button";
  author.textContent = profile?.username || "Member";
  author.addEventListener("click", () => openPublicProfile(comment.author_id));

  header.appendChild(author);

  if (isOwnComment) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "comment-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteComment(comment.id));
    header.appendChild(deleteButton);
  }

  const text = document.createElement("p");
  text.className = "comment-text";
  text.textContent = comment.content;

  const time = document.createElement("small");
  time.className = "post-date";
  time.textContent = formatDate(comment.created_at);

  item.append(header, text, time);
  return item;
}

async function toggleReaction(postId, emoji, clickedButton) {
  if (!currentUser || clickedButton.disabled) return;

  const wasSelected = clickedButton.classList.contains("selected");
  const matchingButtons = [
    ...document.querySelectorAll(
      `.post-card[data-post-id="${postId}"] .reaction-button`
    )
  ].filter((button) => button.dataset.emoji === emoji);

  matchingButtons.forEach((button) => {
    button.disabled = true;
    button.classList.add("is-animating");

    const oldCount = Number(button.dataset.count || 0);
    const nextCount = Math.max(0, oldCount + (wasSelected ? -1 : 1));

    button.dataset.count = String(nextCount);
    button.textContent = `${emoji} ${nextCount || ""}`.trim();
    button.classList.toggle("selected", !wasSelected);
  });

  const result = wasSelected
    ? await supabaseClient
        .from("post_reactions")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", currentUser.id)
        .eq("emoji", emoji)
    : await supabaseClient
        .from("post_reactions")
        .insert({ post_id: postId, user_id: currentUser.id, emoji });

  if (result.error) {
    console.error("Reaction error:", result.error);
    showStatus("Could not save your reaction. Please try again.", true);
    await loadPosts();
    return;
  }

  matchingButtons.forEach((button) => {
    button.disabled = false;
  });
}

async function addComment(post, rawContent) {
  const content = rawContent.trim();
  if (!content) return;

  if (content.length > 1000) {
    showStatus("Comments can be up to 1,000 characters.", true);
    return;
  }

  const { error } = await supabaseClient
    .from("comments")
    .insert({
      post_id: post.id,
      author_id: currentUser.id,
      content
    });

  if (error) {
    console.error("Comment error:", error);
    showStatus("Could not add your comment. Please try again.", true);
    return;
  }

  await loadPosts();
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
    console.error(error);
    showStatus("Could not delete that post.", true);
    return;
  }

  if (post.image_path) {
    await supabaseClient.storage.from(IMAGE_BUCKET).remove([post.image_path]);
  }

  await loadPosts();
}

/* ---------- Post image upload ---------- */

document.getElementById("post-image").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  if (!validTypes.includes(file.type) || file.size > MAX_POST_IMAGE_SIZE) {
    event.target.value = "";
    showStatus("Choose a JPG, PNG, WEBP, or GIF image under 5 MB.", true);
    return;
  }

  selectedPostImage = file;
  document.getElementById("image-preview").src = URL.createObjectURL(file);
  document.getElementById("image-preview-wrap").classList.remove("hidden");
});

document.getElementById("remove-image-button").addEventListener("click", () => {
  selectedPostImage = null;
  document.getElementById("post-image").value = "";
  document.getElementById("image-preview").removeAttribute("src");
  document.getElementById("image-preview-wrap").classList.add("hidden");
});

async function uploadPostImage() {
  if (!selectedPostImage) return null;

  const extension = selectedPostImage.name.split(".").pop().toLowerCase();
  const path =
    `${currentUser.id}/${crypto.randomUUID()}-${escapeFileName(selectedPostImage.name)}`;

  const { error } = await supabaseClient.storage
    .from(IMAGE_BUCKET)
    .upload(path, selectedPostImage, {
      upsert: false,
      contentType: selectedPostImage.type
    });

  if (error) throw error;
  return path;
}

document.getElementById("post-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = document.getElementById("post-content").value.trim();

  if (!content) {
    showStatus("Write something before publishing.", true);
    return;
  }

  const button = document.getElementById("publish-button");
  button.disabled = true;
  button.textContent = "Publishing…";

  let imagePath = null;

  try {
    imagePath = await uploadPostImage();

    const { error } = await supabaseClient.from("posts").insert({
      author_id: currentUser.id,
      content,
      image_path: imagePath
    });

    if (error) throw error;

    document.getElementById("post-content").value = "";
    selectedPostImage = null;
    document.getElementById("post-image").value = "";
    document.getElementById("image-preview").removeAttribute("src");
    document.getElementById("image-preview-wrap").classList.add("hidden");

    await loadPosts();
    clearStatus();
  } catch (error) {
    console.error("Could not publish:", error);

    if (imagePath) {
      await supabaseClient.storage.from(IMAGE_BUCKET).remove([imagePath]);
    }

    showStatus("Could not publish. Check your Supabase storage and database setup.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Publish post";
  }
});

/* ---------- Profile and following ---------- */

async function loadOwnProfileAndDirectory() {
  if (!currentUser) return;

  currentProfile = await loadProfile(currentUser.id);

  if (currentProfile) {
    document.getElementById("my-profile-username").textContent =
      currentProfile.username;
    document.getElementById("profile-bio").value =
      currentProfile.bio || "";

    await setAvatarImage(
      document.getElementById("my-avatar"),
      currentProfile.avatar_path,
      "Your profile picture"
    );
  }

  await loadDirectory();
}

async function loadDirectory() {
  const { data: profiles, error } = await supabaseClient
    .from("profiles")
    .select("id, username, bio, avatar_path")
    .neq("id", currentUser.id)
    .order("username");

  if (error) {
    console.error("Directory error:", error);
    showStatus("Could not load member profiles.", true);
    return;
  }

  if (!profiles.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No other member profiles yet.";
    directory.replaceChildren(empty);
    return;
  }

  const { data: follows, error: followError } = await supabaseClient
    .from("follows")
    .select("followed_id")
    .eq("follower_id", currentUser.id);

  if (followError) console.error(followError);

  const followingIds = new Set((follows || []).map((row) => row.followed_id));
  const fragment = document.createDocumentFragment();

  for (const profile of profiles) {
    const card = document.createElement("article");
    card.className = "directory-card";

    const avatar = document.createElement("img");
    avatar.className = "avatar";
    await setAvatarImage(avatar, profile.avatar_path, `${profile.username}'s picture`);

    const info = document.createElement("div");
    info.className = "directory-card-info";

    const name = document.createElement("button");
    name.className = "profile-name-button";
    name.type = "button";
    name.textContent = profile.username;
    name.addEventListener("click", () => openPublicProfile(profile.id));

    const bio = document.createElement("p");
    bio.textContent = profile.bio || "No bio yet.";

    info.append(name, bio);

    const followButton = document.createElement("button");
    followButton.className = "follow-button";
    followButton.type = "button";

    const alreadyFollowing = followingIds.has(profile.id);
    followButton.textContent = alreadyFollowing ? "Following" : "Follow";
    followButton.classList.toggle("following", alreadyFollowing);
    followButton.addEventListener("click", async () => {
      await toggleFollow(profile.id);
    });

    card.append(avatar, info, followButton);
    fragment.appendChild(card);
  }

  directory.replaceChildren(fragment);
}

async function toggleFollow(targetId) {
  const { data: existing, error: lookupError } = await supabaseClient
    .from("follows")
    .select("id")
    .eq("follower_id", currentUser.id)
    .eq("followed_id", targetId)
    .maybeSingle();

  if (lookupError) {
    console.error(lookupError);
    showStatus("Could not update follow status.", true);
    return;
  }

  const result = existing
    ? await supabaseClient
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("followed_id", targetId)
    : await supabaseClient
        .from("follows")
        .insert({ follower_id: currentUser.id, followed_id: targetId });

  if (result.error) {
    console.error(result.error);
    showStatus("Could not update follow status.", true);
    return;
  }

  await loadDirectory();

  if (currentPublicProfile?.id === targetId) {
    await openPublicProfile(targetId);
  }

  clearStatus();
}

async function getFollowCounts(userId) {
  const [followersResult, followingResult] = await Promise.all([
    supabaseClient
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("followed_id", userId),

    supabaseClient
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("follower_id", userId)
  ]);

  return {
    followers: followersResult.count || 0,
    following: followingResult.count || 0
  };
}

async function openPublicProfile(userId) {
  if (userId === currentUser.id) {
    setView("profile");
    return;
  }

  const profile = await loadProfile(userId);

  if (!profile) {
    showStatus("Could not open that member’s profile.", true);
    return;
  }

  currentPublicProfile = profile;

  document.getElementById("public-username").textContent = profile.username;
  document.getElementById("public-bio").textContent =
    profile.bio || "This member hasn’t added a bio yet.";

  await setAvatarImage(
    document.getElementById("public-avatar"),
    profile.avatar_path,
    `${profile.username}'s profile picture`
  );

  const [counts, followingResult, postsResult] = await Promise.all([
    getFollowCounts(userId),

    supabaseClient
      .from("follows")
      .select("id")
      .eq("follower_id", currentUser.id)
      .eq("followed_id", userId)
      .maybeSingle(),

    supabaseClient
      .from("posts")
      .select("id, author_id, content, image_path, created_at")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
  ]);

  document.getElementById("public-follower-count").textContent = counts.followers;
  document.getElementById("public-following-count").textContent = counts.following;

  const profilePosts = postsResult.data || [];
  document.getElementById("public-post-count").textContent = profilePosts.length;

  const followButton = document.getElementById("follow-button");
  const isFollowing = Boolean(followingResult.data);

  followButton.textContent = isFollowing ? "Following" : "Follow";
  followButton.classList.toggle("following", isFollowing);
  followButton.onclick = () => toggleFollow(userId);

  await renderPublicPosts(profilePosts);
  setView("public-profile");
}

async function renderPublicPosts(posts) {
  const target = document.getElementById("public-post-list");

  if (!posts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "This member hasn’t posted yet.";
    target.replaceChildren(empty);
    return;
  }

  const authorIds = [...new Set(posts.map((post) => post.author_id))];
  const postIds = posts.map((post) => post.id);

  const [profilesResult, commentsResult, reactionsResult] = await Promise.all([
    supabaseClient.from("profiles").select("id, username, avatar_path").in("id", authorIds),
    supabaseClient.from("comments").select("id, post_id, author_id, content, created_at").in("post_id", postIds),
    supabaseClient.from("post_reactions").select("id, post_id, user_id, emoji").in("post_id", postIds)
  ]);

  const profiles = profilesResult.data || [];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const comments = commentsResult.data || [];
  const reactions = reactionsResult.data || [];
  const fragment = document.createDocumentFragment();

  for (const post of posts) {
    fragment.appendChild(
      await buildPostCard(
        post,
        profileMap.get(post.author_id),
        profileMap,
        comments,
        reactions
      )
    );
  }

  target.replaceChildren(fragment);
}

/* Save bio and optional avatar */
document.getElementById("avatar-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!allowed.includes(file.type) || file.size > MAX_AVATAR_SIZE) {
    selectedAvatarImage = null;
    event.target.value = "";
    showStatus("Choose a JPG, PNG, or WEBP picture under 3 MB.", true);
    return;
  }

  selectedAvatarImage = file;
  document.getElementById("my-avatar").src = URL.createObjectURL(file);
});

document.getElementById("profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const bio = document.getElementById("profile-bio").value.trim();

  if (bio.length > 300) {
    showStatus("Your bio can be up to 300 characters.", true);
    return;
  }

  const button = document.getElementById("save-profile-button");
  button.disabled = true;
  button.textContent = "Saving…";

  try {
    let avatarPath = currentProfile?.avatar_path || null;

    if (selectedAvatarImage) {
      const extension = selectedAvatarImage.name.split(".").pop().toLowerCase();
      const newPath =
        `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabaseClient.storage
        .from(AVATAR_BUCKET)
        .upload(newPath, selectedAvatarImage, {
          upsert: false,
          contentType: selectedAvatarImage.type
        });

      if (uploadError) throw uploadError;
      avatarPath = newPath;
    }

    const { error } = await supabaseClient
      .from("profiles")
      .update({ bio, avatar_path: avatarPath })
      .eq("id", currentUser.id);

    if (error) throw error;

    currentProfile = await loadProfile(currentUser.id);
    selectedAvatarImage = null;

    await loadOwnProfileAndDirectory();
    showStatus("Profile saved.");
  } catch (error) {
    console.error("Profile save error:", error);
    showStatus("Could not save the profile. Check your storage setup.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Save profile";
  }
});

/* ---------- Notifications ---------- */

async function loadUnreadNotificationCount() {
  if (!currentUser) return;

  const { count, error } = await supabaseClient
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    console.error("Notification count error:", error);
    return;
  }

  const badge = document.getElementById("notification-badge");
  badge.textContent = count > 99 ? "99+" : String(count || 0);
  badge.classList.toggle("hidden", !count);
}

async function loadNotifications() {
  if (!currentUser) return;

  const { data: notifications, error } = await supabaseClient
    .from("notifications")
    .select("id, recipient_id, actor_id, notification_type, post_id, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Notification load error:", error);
    showStatus("Could not load notifications.", true);
    return;
  }

  if (!notifications.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "You don’t have notifications yet.";
    notificationList.replaceChildren(empty);
    return;
  }

  const actorIds = [...new Set(notifications.map((item) => item.actor_id))];

  const { data: profiles, error: profilesError } = await supabaseClient
    .from("profiles")
    .select("id, username")
    .in("id", actorIds);

  if (profilesError) console.error(profilesError);

  const names = new Map(
    (profiles || []).map((profile) => [profile.id, profile.username])
  );

  const fragment = document.createDocumentFragment();

  notifications.forEach((notification) => {
    const actorName = names.get(notification.actor_id) || "A member";
    const card = document.createElement("article");
    card.className = `notification-card${notification.read_at ? "" : " unread"}`;

    const icon = document.createElement("span");
    icon.className = "notification-emoji";

    const copy = document.createElement("div");
    copy.className = "notification-copy";

    const message = document.createElement("p");

    if (notification.notification_type === "follow") {
      icon.textContent = "👤";
      message.textContent = `${actorName} followed you.`;
    } else if (notification.notification_type === "reaction") {
      icon.textContent = "💜";
      message.textContent = `${actorName} reacted to your post.`;
    } else {
      icon.textContent = "💬";
      message.textContent = `${actorName} commented on your post.`;
    }

    const date = document.createElement("small");
    date.textContent = formatDate(notification.created_at);

    copy.append(message, date);
    card.append(icon, copy);
    fragment.appendChild(card);
  });

  notificationList.replaceChildren(fragment);

  const unreadIds = notifications
    .filter((item) => !item.read_at)
    .map((item) => item.id);

  if (unreadIds.length) {
    await supabaseClient
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);

    await loadUnreadNotificationCount();
  }
}

/* ---------- Registration and login ---------- */

document.getElementById("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();

  const username = document
    .getElementById("register-username")
    .value.trim()
    .toLowerCase();

  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;

  if (!usernameIsValid(username)) {
    showStatus("Username must be 3–20 characters and use letters, numbers, or underscores.", true);
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
        emailRedirectTo: redirectUrl()
      }
    });

    if (error) {
      showStatus(error.message, true);
      return;
    }

    if (data.session && data.user) {
      await showSignedInApp(data.user);
      return;
    }

    pendingVerificationEmail = email;
    document.getElementById("verification-message").textContent =
      `We sent a verification link to ${email}. Open it before logging in. Check your spam folder if you don’t see it.`;

    document.getElementById("login-form").classList.add("hidden");
    document.getElementById("register-form").classList.add("hidden");
    document.getElementById("verification-panel").classList.remove("hidden");
  } catch (error) {
    console.error(error);
    showStatus("Could not create your account. Please try again.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Create account";
  }
});

document.getElementById("resend-verification-button").addEventListener("click", async () => {
  if (!pendingVerificationEmail) {
    showStatus("Register first to request a verification email.", true);
    return;
  }

  const { error } = await supabaseClient.auth.resend({
    type: "signup",
    email: pendingVerificationEmail,
    options: { emailRedirectTo: redirectUrl() }
  });

  if (error) {
    showStatus("Could not resend the email. Try again shortly.", true);
  } else {
    showStatus("A new verification email has been sent.");
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
      showStatus("Could not log in. Check your email and password, and verify your email if required.", true);
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
    showStatus("Enter your email first.", true);
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl()
  });

  if (error) {
    showStatus("Could not send the password reset email.", true);
  } else {
    showStatus("If the account exists, a password reset email has been sent.");
  }
});

/* ---------- Navigation and startup ---------- */

document.getElementById("show-login-button").addEventListener("click", () => showAuthForm("login"));
document.getElementById("show-register-button").addEventListener("click", () => showAuthForm("register"));
document.getElementById("login-to-register-link").addEventListener("click", () => showAuthForm("register"));
document.getElementById("register-to-login-link").addEventListener("click", () => showAuthForm("login"));

document.querySelectorAll(".bottom-nav-button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.getElementById("refresh-posts-button").addEventListener("click", loadPosts);
document.getElementById("refresh-my-posts-button").addEventListener("click", loadPosts);
document.getElementById("refresh-notifications-button").addEventListener("click", loadNotifications);

document.getElementById("back-to-profiles-button").addEventListener("click", () => {
  setView("profile");
});

document.getElementById("logout-button").addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showStatus("Could not log out. Please try again.", true);
    return;
  }

  showSignedOutApp();
});

function redirectUrl() {
  return window.location.origin + window.location.pathname;
}

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

initialize();
