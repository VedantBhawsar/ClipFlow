--
-- PostgreSQL database dump
--

\restrict MEzriak9amTNMGUsVOfJEnkp0H3wT4x11RKcJ1dqhcSSySjYJT6ANK1hfjEBOxN

-- Dumped from database version 18.4 (eaf151e)
-- Dumped by pg_dump version 18.4 (Debian 18.4-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AuthProvider; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public."AuthProvider" AS ENUM (
    'EMAIL',
    'GOOGLE'
);


ALTER TYPE public."AuthProvider" OWNER TO neondb_owner;

--
-- Name: ChannelConnectionStatus; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public."ChannelConnectionStatus" AS ENUM (
    'CONNECTED',
    'NEEDS_REAUTH',
    'DISCONNECTED'
);


ALTER TYPE public."ChannelConnectionStatus" OWNER TO neondb_owner;

--
-- Name: ChapterBehavior; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public."ChapterBehavior" AS ENUM (
    'ALWAYS_REVIEW',
    'AUTO_APPLY_IF_VALID'
);


ALTER TYPE public."ChapterBehavior" OWNER TO neondb_owner;

--
-- Name: ContentNiche; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public."ContentNiche" AS ENUM (
    'GAMING',
    'TECH_EDUCATION',
    'VLOG_LIFESTYLE',
    'BUSINESS_FINANCE',
    'ENTERTAINMENT_COMEDY',
    'OTHER'
);


ALTER TYPE public."ContentNiche" OWNER TO neondb_owner;

--
-- Name: PrimaryGoal; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public."PrimaryGoal" AS ENUM (
    'SAVE_TIME_EDITING',
    'BETTER_THUMBNAILS_CTR',
    'CONSISTENT_SCHEDULE',
    'GROW_VIEWS'
);


ALTER TYPE public."PrimaryGoal" OWNER TO neondb_owner;

--
-- Name: ThumbnailStyleOverride; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public."ThumbnailStyleOverride" AS ENUM (
    'AUTO',
    'BOLD',
    'MINIMAL',
    'TEXT_FORWARD'
);


ALTER TYPE public."ThumbnailStyleOverride" OWNER TO neondb_owner;

--
-- Name: UploadFrequency; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public."UploadFrequency" AS ENUM (
    'ONE_TO_FOUR',
    'FIVE_TO_TEN',
    'ELEVEN_TO_TWENTY',
    'TWENTY_PLUS'
);


ALTER TYPE public."UploadFrequency" OWNER TO neondb_owner;

--
-- Name: VideoStatus; Type: TYPE; Schema: public; Owner: neondb_owner
--

CREATE TYPE public."VideoStatus" AS ENUM (
    'UPLOADED',
    'READY',
    'SCHEDULED',
    'PUBLISHING',
    'PUBLISHED',
    'PUBLISH_FAILED'
);


ALTER TYPE public."VideoStatus" OWNER TO neondb_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO neondb_owner;

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.refresh_tokens (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "familyId" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "userAgent" text,
    ip text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.refresh_tokens OWNER TO neondb_owner;

--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_preferences (
    id text NOT NULL,
    "userId" text NOT NULL,
    "notifyProcessingComplete" boolean DEFAULT true NOT NULL,
    "notifyPublished" boolean DEFAULT true NOT NULL,
    "notifyPublishFailed" boolean DEFAULT true NOT NULL,
    "notifyNeedsReauth" boolean DEFAULT true NOT NULL,
    "notifyWeeklySummary" boolean DEFAULT false NOT NULL,
    "defaultTimezone" text DEFAULT 'UTC'::text NOT NULL,
    "defaultPublishTime" text DEFAULT '18:00'::text NOT NULL,
    "chapterBehavior" public."ChapterBehavior" DEFAULT 'ALWAYS_REVIEW'::public."ChapterBehavior" NOT NULL,
    "thumbnailStyle" public."ThumbnailStyleOverride" DEFAULT 'AUTO'::public."ThumbnailStyleOverride" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.user_preferences OWNER TO neondb_owner;

--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.user_profiles (
    id text NOT NULL,
    "userId" text NOT NULL,
    "displayName" text,
    niche public."ContentNiche",
    "uploadFrequency" public."UploadFrequency",
    "primaryGoal" public."PrimaryGoal",
    "recommendedPlanId" text,
    "onboardingCompletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.user_profiles OWNER TO neondb_owner;

--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text,
    name text,
    "authProvider" public."AuthProvider" DEFAULT 'EMAIL'::public."AuthProvider" NOT NULL,
    "googleId" text,
    "emailVerifiedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: videos; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.videos (
    id text NOT NULL,
    "userId" text NOT NULL,
    "youtubeChannelId" text NOT NULL,
    title text NOT NULL,
    description text,
    tags text[],
    "categoryId" text DEFAULT '22'::text NOT NULL,
    "privacyStatus" text DEFAULT 'private'::text NOT NULL,
    "originalFilename" text NOT NULL,
    "fileSizeBytes" bigint NOT NULL,
    "contentType" text DEFAULT 'video/mp4'::text NOT NULL,
    "s3KeyOriginal" text NOT NULL,
    status public."VideoStatus" DEFAULT 'UPLOADED'::public."VideoStatus" NOT NULL,
    "failureReason" text,
    "scheduledPublishAt" timestamp(3) without time zone,
    "youtubeVideoId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "publishedAt" timestamp(3) without time zone,
    "madeForKids" boolean DEFAULT false NOT NULL,
    "ageRestriction" text DEFAULT 'none'::text NOT NULL,
    embeddable boolean DEFAULT true NOT NULL,
    license text DEFAULT 'standard'::text NOT NULL,
    "publicStatsViewable" boolean DEFAULT true NOT NULL,
    "commentPolicy" text DEFAULT 'allowAll'::text NOT NULL
);


ALTER TABLE public.videos OWNER TO neondb_owner;

--
-- Name: youtube_channels; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.youtube_channels (
    id text NOT NULL,
    "userId" text NOT NULL,
    "youtubeChannelId" text NOT NULL,
    "channelTitle" text NOT NULL,
    "channelThumbnailUrl" text,
    "refreshTokenEncrypted" text NOT NULL,
    scopes text NOT NULL,
    status public."ChannelConnectionStatus" DEFAULT 'CONNECTED'::public."ChannelConnectionStatus" NOT NULL,
    "lastVerifiedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.youtube_channels OWNER TO neondb_owner;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
0901187e-e038-431b-8301-1bc032d9670b	27708b73a29fd48577117fc7c9fa8869a384e9869bc1087dc627a26300cb58ac	2026-06-22 05:55:42.766194+00	20260622055536_init	\N	\N	2026-06-22 05:55:38.374114+00	1
e4f44f6e-dc77-442c-9619-ffedacbb5c42	8a28a49e95a89722583c6a6b6500f6f749e33c02ad88b4305832c56910b1c13d	2026-06-22 09:30:11.906129+00	20260623000000_add_user_preferences	\N	\N	2026-06-22 09:30:09.431118+00	1
61c111e8-4342-4304-b74b-5c81e84f5117	85733545138efbbf5d189fe0a04f3bf5fca7f832c1bca70c33154fd8f6b74512	2026-06-22 14:30:16.593334+00	20260622142741_added_youtubw	\N	\N	2026-06-22 14:30:11.321226+00	1
7555dfe8-ddee-47b6-9318-a06d55f4344f	c68c3cc562dc357e8f5892affe35af46c765955ed67a7e5abeff17f60ee6d58e	2026-06-23 06:53:17.272025+00	20260623065310_add_video_model	\N	\N	2026-06-23 06:53:12.104094+00	1
619aa537-2646-4f60-beab-a68313f7e679	92da1f51e0d7346c6505ae43b50eea5197809c4e6362b4963d60cf7d4a6d79b4	2026-06-24 04:15:03.057998+00	20260624041459_add_performance_indexes	\N	\N	2026-06-24 04:15:01.050226+00	1
5f439c56-0a5a-4f20-88e7-fa52dda60125	6468dfee358c39467018bc707b2db3fe7785d5b557161c454761f5b89de763aa	2026-06-24 14:34:18.344137+00	20260624090000_add_video_controls	\N	\N	2026-06-24 14:34:16.890594+00	1
20c3f5de-97c4-42a2-aa27-ae4a42bbc5ae	e0c9b9d712edddbc0604757317f453f83c3f9985da5af9a84841bcbdf7d3463f	2026-06-24 15:22:45.236276+00	20260624152240_add_token_rotation_in_athentication	\N	\N	2026-06-24 15:22:42.2664+00	1
a23daeea-2aeb-44bb-b327-6e07f77ce093	707286c4741d5c876b907e166296b4b65b6e5a4f83ddee82352199ac152cb96b	2026-06-25 13:00:55.434281+00	20260625130052_add_indexing_in_user_table	\N	\N	2026-06-25 13:00:54.056412+00	1
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.refresh_tokens (id, "userId", "tokenHash", "familyId", "expiresAt", "revokedAt", "userAgent", ip, "createdAt") FROM stdin;
cmqs82vrv0002tynkquus16j5	cmqosywrs0000n9nkch60f28o	e2c9a5cd91e021868b6816511d693cda1c4c2c6f45e62686deacebabb68463d2	K_nW-4h9gIKpO2ceNraE3g	2026-07-01 15:22:55.195	2026-06-24 15:23:05.261	\N	\N	2026-06-24 15:22:55.195
cmqs836bc0003tynkj5rzhndj	cmqosywrs0000n9nkch60f28o	7624793be2ca5c7e1d8cbf15d25f9c6ec5daba6e101b708ac4e93547c4b7a66b	8NEuz74HYJDuMchDAfw-Vw	2026-07-01 15:23:08.856	\N	\N	\N	2026-06-24 15:23:08.856
cmqs8k95j0004tynk1xg9b79z	cmqosywrs0000n9nkch60f28o	3f7a3821e6a60b3527a645e83916f3788aae585921551f6a265f94685138e8d4	iATzngFTsBp9rdHYciJFeQ	2026-07-01 15:36:25.687	\N	\N	\N	2026-06-24 15:36:25.687
cmqth8rb40002pknklvd657bx	cmqosywrs0000n9nkch60f28o	531351f8125c794afefdf309a0e4eca69ad85d140664c306d88306f055d5b938	WkyVDa6kn_9mhevU1A-woQ	2026-07-02 12:27:12.063	\N	\N	\N	2026-06-25 12:27:12.064
cmqth8ujd0003pknkrap7su61	cmqosywrs0000n9nkch60f28o	5c36a611d9144eb066deaf63007c38252375b5aa635264126e4471a3e90cdd1a	5Nuf3zZ1WvQ6g4vsJRtsLA	2026-07-02 12:27:16.249	\N	\N	\N	2026-06-25 12:27:16.249
cmqth8ykh0004pknkgndjvpr9	cmqosywrs0000n9nkch60f28o	fe3ed40aa2d08cbd1aa67c68d47513d85e1e8008912265274ac60d8e4e912e04	shLDhZiY0D6xcQevBaWpUA	2026-07-02 12:27:21.473	\N	\N	\N	2026-06-25 12:27:21.473
cmqth910o0005pknkayomucrz	cmqosywrs0000n9nkch60f28o	1480ff6a2f94ca40bbe861411b55ba0e1c79db6c16010514072c90492574457f	ZuSTpHgS5WSNymBFGuP8Ug	2026-07-02 12:27:24.647	\N	\N	\N	2026-06-25 12:27:24.648
cmqthesob0000upnk6ez2bpvn	cmqosywrs0000n9nkch60f28o	a57e1ba4b239cf19ac166c906f4bf12c6688c05306bd8665dfe64c5ddc151e85	HA6I-FbQFtSmmM3hqxBZrw	2026-07-02 12:31:53.766	\N	\N	\N	2026-06-25 12:31:53.771
\.


--
-- Data for Name: user_preferences; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_preferences (id, "userId", "notifyProcessingComplete", "notifyPublished", "notifyPublishFailed", "notifyNeedsReauth", "notifyWeeklySummary", "defaultTimezone", "defaultPublishTime", "chapterBehavior", "thumbnailStyle", "createdAt", "updatedAt") FROM stdin;
cmqp0u32i0000ugnkbawp4gxk	cmqosywrs0000n9nkch60f28o	t	t	t	t	f	Asia/Calcutta	18:00	ALWAYS_REVIEW	AUTO	2026-06-22 09:36:48.906	2026-06-22 13:37:06.397
cmqs1kfzf0001r6nkc7g4fpfm	cmqs1k5390000r6nkbrry8plt	t	t	t	t	f	UTC	18:00	ALWAYS_REVIEW	AUTO	2026-06-24 12:20:37.227	2026-06-24 12:20:37.227
\.


--
-- Data for Name: user_profiles; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.user_profiles (id, "userId", "displayName", niche, "uploadFrequency", "primaryGoal", "recommendedPlanId", "onboardingCompletedAt", "createdAt", "updatedAt") FROM stdin;
cmqoszdn30001n9nkwcu5skuh	cmqosywrs0000n9nkch60f28o	Vedant youtube channel	GAMING	ONE_TO_FOUR	CONSISTENT_SCHEDULE	starter	2026-06-25 12:24:50.347	2026-06-22 05:56:58.959	2026-06-25 12:36:41.623
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, email, "passwordHash", name, "authProvider", "googleId", "emailVerifiedAt", "createdAt", "updatedAt") FROM stdin;
cmqosywrs0000n9nkch60f28o	vedxntbhavsar@gmail.com	$2b$12$h.EQ9ldaZGgqyynSjMmM/uH8lGYdAXu.i.xXENpAXR7HRcrz91BU.	Vedant	EMAIL	\N	\N	2026-06-22 05:56:37.096	2026-06-22 05:56:37.096
cmqs1k5390000r6nkbrry8plt	debug-vebjf@test.com	$2b$12$zrgElBufwq0kgmqANS5JEuh7Yppi40tLqv8nQrR7miO6zqgvXTmG2	Debug User	EMAIL	\N	\N	2026-06-24 12:20:23.109	2026-06-24 12:20:23.109
\.


--
-- Data for Name: videos; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.videos (id, "userId", "youtubeChannelId", title, description, tags, "categoryId", "privacyStatus", "originalFilename", "fileSizeBytes", "contentType", "s3KeyOriginal", status, "failureReason", "scheduledPublishAt", "youtubeVideoId", "createdAt", "updatedAt", "publishedAt", "madeForKids", "ageRestriction", embeddable, license, "publicStatsViewable", "commentPolicy") FROM stdin;
vid_30a11bd1-aea3-4e4b-b095-2b422ae6a28f	cmqosywrs0000n9nkch60f28o	cmqpdi52m0000ucnkmgs9w0w5	sdfs	dfsdfsdfsfd	{dsfsd,sdfsdf,sdfsdfsdf}	22	unlisted	video.mp4	31329849	video/mp4	videos/cmqosywrs0000n9nkch60f28o/vid_30a11bd1-aea3-4e4b-b095-2b422ae6a28f/original.mp4	PUBLISHING	\N	\N	\N	2026-06-23 15:17:28.723	2026-06-24 04:06:43.07	\N	f	none	t	standard	t	allowAll
vid_c66e1541-cfbb-4f09-a236-6bf3bac95ab6	cmqosywrs0000n9nkch60f28o	cmqpdi52m0000ucnkmgs9w0w5	Vedant	Vedant	{vedant}	22	private	video.mp4	31329849	video/mp4	videos/cmqosywrs0000n9nkch60f28o/vid_c66e1541-cfbb-4f09-a236-6bf3bac95ab6/original.mp4	PUBLISHED	\N	\N	lH1Z8mfk7_U	2026-06-24 04:07:41.123	2026-06-24 04:07:56.443	2026-06-24 04:07:56.438	f	none	t	standard	t	allowAll
\.


--
-- Data for Name: youtube_channels; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.youtube_channels (id, "userId", "youtubeChannelId", "channelTitle", "channelThumbnailUrl", "refreshTokenEncrypted", scopes, status, "lastVerifiedAt", "createdAt", "updatedAt") FROM stdin;
cmqpdi52m0000ucnkmgs9w0w5	cmqosywrs0000n9nkch60f28o	UCcVjZC5zhBtB6MAMnmlfcYA	Vedant Bhavsar	https://yt3.ggpht.com/XsZLgZd-5oMC_wNb_ZgkoPmhzAe-bmxDW6ae2ZLuYMPMaZE3oxqjMRBqihxL-hpE-3z1I4UDKIE=s88-c-k-c0x00ffffff-no-rj	L8oFJLVvyphXdmCz.l18NASnaSFM3CKRT6fzgog==.oS/QJTtfkti3ilNHW/YKH0Q0u5lVFQW6X2p1JHv5ubriFqTL1UHkmF7dSByPDnZ5+E90oq1ahVvFUmj3SiZ/i/ktJ8BEud8TDlQJPOWAS+5rjNnPH5/BJP/W5hEj4zzrMZCOGrIMnA==	https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly	CONNECTED	2026-06-24 16:02:45.593	2026-06-22 15:31:26.638	2026-06-24 16:02:45.596
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: videos videos_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (id);


--
-- Name: youtube_channels youtube_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.youtube_channels
    ADD CONSTRAINT youtube_channels_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens_expiresAt_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "refresh_tokens_expiresAt_idx" ON public.refresh_tokens USING btree ("expiresAt");


--
-- Name: refresh_tokens_familyId_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "refresh_tokens_familyId_idx" ON public.refresh_tokens USING btree ("familyId");


--
-- Name: refresh_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON public.refresh_tokens USING btree ("tokenHash");


--
-- Name: refresh_tokens_userId_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "refresh_tokens_userId_idx" ON public.refresh_tokens USING btree ("userId");


--
-- Name: user_preferences_userId_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "user_preferences_userId_key" ON public.user_preferences USING btree ("userId");


--
-- Name: user_profiles_userId_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "user_profiles_userId_key" ON public.user_profiles USING btree ("userId");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_googleId_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "users_googleId_key" ON public.users USING btree ("googleId");


--
-- Name: users_id_email_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX users_id_email_idx ON public.users USING btree (id, email);


--
-- Name: videos_s3KeyOriginal_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "videos_s3KeyOriginal_key" ON public.videos USING btree ("s3KeyOriginal");


--
-- Name: videos_scheduledPublishAt_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "videos_scheduledPublishAt_idx" ON public.videos USING btree ("scheduledPublishAt");


--
-- Name: videos_status_scheduledPublishAt_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "videos_status_scheduledPublishAt_idx" ON public.videos USING btree (status, "scheduledPublishAt");


--
-- Name: videos_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "videos_userId_createdAt_idx" ON public.videos USING btree ("userId", "createdAt" DESC);


--
-- Name: videos_userId_status_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "videos_userId_status_idx" ON public.videos USING btree ("userId", status);


--
-- Name: videos_youtubeVideoId_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "videos_youtubeVideoId_key" ON public.videos USING btree ("youtubeVideoId");


--
-- Name: youtube_channels_status_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX youtube_channels_status_idx ON public.youtube_channels USING btree (status);


--
-- Name: youtube_channels_userId_key; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "youtube_channels_userId_key" ON public.youtube_channels USING btree ("userId");


--
-- Name: youtube_channels_youtubeChannelId_idx; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "youtube_channels_youtubeChannelId_idx" ON public.youtube_channels USING btree ("youtubeChannelId");


--
-- Name: refresh_tokens refresh_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: videos videos_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT "videos_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: videos videos_youtubeChannelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT "videos_youtubeChannelId_fkey" FOREIGN KEY ("youtubeChannelId") REFERENCES public.youtube_channels(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: youtube_channels youtube_channels_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.youtube_channels
    ADD CONSTRAINT "youtube_channels_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

\unrestrict MEzriak9amTNMGUsVOfJEnkp0H3wT4x11RKcJ1dqhcSSySjYJT6ANK1hfjEBOxN

