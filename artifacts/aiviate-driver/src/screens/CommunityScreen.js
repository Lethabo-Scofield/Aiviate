import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../components/ScreenHeader';
import { useToast } from '../contexts/ToastContext';
import * as backend from '../services/backend';
import { ApiError } from '../services/http';
import { haptic } from '../utils/haptics';
import { COLORS } from '../theme';

const CATEGORIES = {
  general: { label: 'Chat', icon: 'chatbubble-outline', color: COLORS.textDim },
  road: { label: 'Road update', icon: 'construct-outline', color: COLORS.warning },
  safety: { label: 'Safety', icon: 'warning-outline', color: COLORS.danger },
  notice: { label: 'Dispatch notice', icon: 'megaphone-outline', color: COLORS.teal },
};
const DRIVER_CHOICES = ['general', 'road', 'safety'];
const PLACEHOLDER = {
  general: 'Ask a question or say hello to the team…',
  road: 'e.g. Roadworks on Main Rd, use 5th Ave instead',
  safety: 'e.g. Loose dog at 12 Oak St, call ahead',
};

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return d.toLocaleDateString();
}

export default function CommunityScreen() {
  const { toast } = useToast();
  // The toast api object changes whenever a toast shows; read it via a ref so
  // a failing load can't retrigger the focus effect in a loop.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [category, setCategory] = useState('general');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPosts(await backend.getCommunityPosts());
      setUnavailable(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setUnavailable(true);
      else toastRef.current.error(e.message || 'Could not load Community');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const post = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await backend.createCommunityPost({ body: body.trim(), category });
      haptic.success();
      setBody('');
      await load();
    } catch (e) {
      haptic.error();
      toast.error(e.message || 'Could not post');
    } finally {
      setBusy(false);
    }
  };

  const remove = (postId) => {
    const run = async () => {
      try {
        await backend.deleteCommunityPost(postId);
        await load();
      } catch (e) {
        toast.error(e.message || 'Could not delete');
      }
    };
    if (Platform.OS === 'web') { run(); return; }
    Alert.alert('Delete post', 'Remove this post for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Community" subtitle="Drivers and dispatch" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.teal} colors={[COLORS.teal]} />}
        >
          {unavailable ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={22} color={COLORS.textDim} />
              <Text style={styles.emptyTitle}>Community isn't available yet</Text>
              <Text style={styles.emptyText}>Your company's server hasn't been updated with Community. Ask your dispatcher.</Text>
            </View>
          ) : (
            <>
              <View style={styles.composer}>
                <View style={styles.chips}>
                  {DRIVER_CHOICES.map((key) => {
                    const c = CATEGORIES[key];
                    const active = category === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => { haptic.selection(); setCategory(key); }}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                      >
                        <Ionicons name={c.icon} size={13} color={active ? '#fff' : COLORS.textDim} />
                        <Text style={[styles.chipText, active && { color: '#fff' }]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={styles.input}
                  value={body}
                  onChangeText={setBody}
                  placeholder={PLACEHOLDER[category]}
                  placeholderTextColor={COLORS.textTertiary}
                  multiline
                  maxLength={1000}
                  accessibilityLabel="Message"
                />
                <View style={styles.composerFoot}>
                  <Text style={styles.composerHint}>Don't share customers' personal details.</Text>
                  <TouchableOpacity
                    style={[styles.postBtn, (!body.trim() || busy) && styles.postBtnDisabled]}
                    onPress={post}
                    disabled={!body.trim() || busy}
                    accessibilityRole="button"
                  >
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postText}>Post</Text>}
                  </TouchableOpacity>
                </View>
              </View>

              {loading ? (
                <ActivityIndicator color={COLORS.teal} style={{ marginTop: 24 }} />
              ) : posts.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="chatbubbles-outline" size={22} color={COLORS.textDim} />
                  <Text style={styles.emptyTitle}>No posts yet</Text>
                  <Text style={styles.emptyText}>Be the first to share something with the team.</Text>
                </View>
              ) : (
                posts.map((p) => <Thread key={p.id} post={p} onDelete={remove} onReplied={load} />)
              )}
            </>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Byline({ post }) {
  return (
    <View style={styles.byline}>
      <Text style={styles.author}>{post.author_name}</Text>
      {post.author_role === 'admin' ? <Text style={styles.dispatchTag}>DISPATCH</Text> : null}
      <Text style={styles.time}>· {timeAgo(post.created_at)}</Text>
    </View>
  );
}

function Thread({ post, onDelete, onReplied }) {
  const { toast } = useToast();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const c = CATEGORIES[post.category] || CATEGORIES.general;

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await backend.createCommunityPost({ body: reply.trim(), parentId: post.id });
      setReply('');
      setReplying(false);
      onReplied();
    } catch (e) {
      toast.error(e.message || 'Could not reply');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, post.category === 'notice' && styles.noticeCard]}>
      <View style={styles.cardHead}>
        <View style={styles.categoryPill}>
          <Ionicons name={c.icon} size={12} color={c.color} />
          <Text style={[styles.categoryText, { color: c.color }]}>{c.label}</Text>
        </View>
        {post.can_delete ? (
          <TouchableOpacity onPress={() => onDelete(post.id)} accessibilityLabel="Delete post" hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={COLORS.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <Byline post={post} />
      <Text style={styles.body}>{post.body}</Text>

      {post.replies?.length ? (
        <View style={styles.replies}>
          {post.replies.map((r) => (
            <View key={r.id} style={styles.reply}>
              <View style={{ flex: 1 }}>
                <Byline post={r} />
                <Text style={styles.replyBody}>{r.body}</Text>
              </View>
              {r.can_delete ? (
                <TouchableOpacity onPress={() => onDelete(r.id)} accessibilityLabel="Delete reply" hitSlop={8}>
                  <Ionicons name="trash-outline" size={14} color={COLORS.textTertiary} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {replying ? (
        <View style={styles.replyRow}>
          <TextInput
            style={[styles.input, styles.replyInput]}
            value={reply}
            onChangeText={setReply}
            placeholder="Write a reply…"
            placeholderTextColor={COLORS.textTertiary}
            maxLength={1000}
            autoFocus
            accessibilityLabel="Reply"
          />
          <TouchableOpacity style={[styles.postBtn, (!reply.trim() || busy) && styles.postBtnDisabled]} onPress={send} disabled={!reply.trim() || busy}>
            <Text style={styles.postText}>Send</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setReplying(true)} style={{ marginTop: 10 }} accessibilityRole="button">
          <Text style={styles.replyLink}>Reply{post.replies?.length ? ` · ${post.replies.length}` : ''}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16 },
  composer: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: COLORS.borderStrong },
  chipActive: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.textDim },
  input: {
    borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12, backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: COLORS.text, minHeight: 72, textAlignVertical: 'top',
  },
  composerFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  composerHint: { flex: 1, fontSize: 11, color: COLORS.textDim },
  postBtn: { backgroundColor: COLORS.teal, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, minWidth: 64, alignItems: 'center' },
  postBtnDisabled: { backgroundColor: '#9AA8B2' },
  postText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  noticeCard: { borderColor: 'rgba(0,128,128,0.4)' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  categoryPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.fillSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  categoryText: { fontSize: 11, fontWeight: '700' },
  byline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  author: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  dispatchTag: { fontSize: 9, fontWeight: '800', color: COLORS.textDim, backgroundColor: COLORS.fill, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  time: { fontSize: 12, color: COLORS.textDim },
  body: { fontSize: 15, lineHeight: 21, color: COLORS.text, marginTop: 4 },
  replies: { marginTop: 10, borderLeftWidth: 2, borderLeftColor: COLORS.fill, paddingLeft: 12, gap: 10 },
  reply: { flexDirection: 'row', gap: 8 },
  replyBody: { fontSize: 14, lineHeight: 19, color: COLORS.text, marginTop: 2 },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  replyInput: { flex: 1, minHeight: 40, paddingVertical: 8 },
  replyLink: { fontSize: 13, fontWeight: '700', color: COLORS.teal },
  empty: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.textDim, textAlign: 'center', lineHeight: 18 },
});
