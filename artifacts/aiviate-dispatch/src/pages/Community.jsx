import { useCallback, useEffect, useState } from "react";
import { Construction, Megaphone, MessageCircle, MessagesSquare, ShieldAlert, Trash2 } from "lucide-react";
import { createCommunityPost, deleteCommunityPost, getCommunityPosts } from "../services/api";
import { useAuth } from "../contexts/AuthContext";

const CATEGORIES = {
  general: { label: "Chat", icon: MessageCircle, tone: "bg-[#F1F3F5] text-[#5C636A]" },
  road: { label: "Road update", icon: Construction, tone: "bg-[#FFF4E0] text-[#9A5B00]" },
  safety: { label: "Safety", icon: ShieldAlert, tone: "bg-[#FDECEC] text-[#B42318]" },
  notice: { label: "Dispatch notice", icon: Megaphone, tone: "bg-[#111315] text-white" },
};

const PLACEHOLDER = {
  general: "Ask a question or say hello to the team...",
  road: "e.g. Roadworks on Main Rd near the depot, use 5th Ave instead",
  safety: "e.g. Loose dog at 12 Oak St — stay in the van and call ahead",
  notice: "e.g. Depot closes at 17:00 on Friday",
};

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return d.toLocaleDateString();
}

function Author({ post }) {
  return (
    <p className="text-[13px] text-[#111315]">
      <span className="font-semibold">{post.author_name}</span>
      {post.author_role === "admin" && <span className="ml-1.5 rounded bg-[#F1F3F5] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5C636A]">Dispatch</span>}
      <span className="ml-1.5 text-[12px] text-[#868E96]">· {timeAgo(post.created_at)}</span>
    </p>
  );
}

export default function Community() {
  const { user } = useAuth();
  const isAdmin = user?.role !== "driver";
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState(isAdmin ? "notice" : "general");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const res = await getCommunityPosts();
      setPosts(res.posts || []);
      setError("");
    } catch (e) {
      setError(e.message || "Could not load the community feed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await createCommunityPost({ body: body.trim(), category });
      setBody("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (postId) => {
    try {
      await deleteCommunityPost(postId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const choices = Object.entries(CATEGORIES).filter(([key]) => isAdmin || key !== "notice");
  const shown = filter === "all" ? posts : posts.filter((p) => p.category === filter);

  return (
    <div className="mx-auto max-w-[720px] animate-fade-in">
      <div className="mb-6">
        <h1 className="text-[24px] font-semibold tracking-tight text-[#111315]">Community</h1>
        <p className="mt-1 text-[14px] text-[#5C636A]">
          {isAdmin
            ? "Send notices to every driver and see the road updates they share."
            : "Talk to other drivers and dispatch: share road updates, safety warnings and questions."}
        </p>
      </div>

      <form onSubmit={submit} className="apple-card mb-6 p-4" aria-label="New post">
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Post type">
          {choices.map(([key, c]) => {
            const Icon = c.icon;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={category === key}
                onClick={() => setCategory(key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  category === key ? "border-[#111315] bg-[#111315] text-white" : "border-[#DEE2E6] text-[#5C636A] hover:border-[#ADB5BD]"
                }`}
              >
                <Icon size={13} /> {c.label}
              </button>
            );
          })}
        </div>
        <label htmlFor="community-body" className="sr-only">Message</label>
        <textarea
          id="community-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={PLACEHOLDER[category]}
          className="apple-input resize-none"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#868E96]">Visible to everyone in your company. Don't share customers' personal details.</p>
          <button type="submit" disabled={busy || !body.trim()} className="apple-btn apple-btn-primary shrink-0 disabled:opacity-40" data-testid="button-community-post">
            {busy ? "Posting..." : "Post"}
          </button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter posts">
        {[["all", "All"], ...Object.entries(CATEGORIES).map(([k, c]) => [k, c.label])].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium ${filter === key ? "bg-[#F1F3F5] text-[#111315]" : "text-[#868E96] hover:text-[#111315]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl bg-[#FDECEC] px-4 py-3 text-[13px] text-[#B42318]">{error}</p>}

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="apple-card p-10 text-center">
          <MessagesSquare size={22} className="mx-auto mb-3 text-[#ADB5BD]" />
          <p className="text-[14px] font-medium text-[#343A40]">No posts yet</p>
          <p className="mt-1 text-[13px] text-[#868E96]">Be the first to share something with the team.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((post) => <Thread key={post.id} post={post} onDelete={remove} onReplied={load} />)}
        </ul>
      )}
    </div>
  );
}

function Thread({ post, onDelete, onReplied }) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const c = CATEGORIES[post.category] || CATEGORIES.general;
  const Icon = c.icon;

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await createCommunityPost({ body: reply.trim(), parentId: post.id });
      setReply("");
      setReplying(false);
      onReplied();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="apple-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.tone}`}>
            <Icon size={11} /> {c.label}
          </span>
          <Author post={post} />
        </div>
        {post.can_delete && (
          <button type="button" onClick={() => onDelete(post.id)} aria-label="Delete post" className="rounded-lg p-1.5 text-[#ADB5BD] hover:bg-[#F1F3F5] hover:text-[#B42318]">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#343A40]">{post.body}</p>

      {post.replies?.length > 0 && (
        <ul className="mt-3 space-y-2.5 border-l-2 border-[#F1F3F5] pl-3.5">
          {post.replies.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Author post={r} />
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] text-[#5C636A]">{r.body}</p>
              </div>
              {r.can_delete && (
                <button type="button" onClick={() => onDelete(r.id)} aria-label="Delete reply" className="rounded-lg p-1 text-[#ADB5BD] hover:text-[#B42318]">
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {replying ? (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <label htmlFor={`reply-${post.id}`} className="sr-only">Reply</label>
          <input
            id={`reply-${post.id}`}
            autoFocus
            value={reply}
            maxLength={1000}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply..."
            className="apple-input flex-1 !py-2"
          />
          <button type="submit" disabled={busy || !reply.trim()} className="apple-btn apple-btn-primary !py-2 disabled:opacity-40">Reply</button>
        </form>
      ) : (
        <button type="button" onClick={() => setReplying(true)} className="mt-2.5 text-[12px] font-semibold text-[#5C636A] hover:text-[#111315]">
          Reply{post.replies?.length ? ` · ${post.replies.length}` : ""}
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-[12px] text-[#B42318]">{error}</p>}
    </li>
  );
}
