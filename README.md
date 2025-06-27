# BBFF & HMB Brewing Co. Photo Sharing Site

A serverless photo sharing solution built on Cloudflare's platform for the Half Moon Bay Brewing Company's 25th Anniversary celebration, featuring automatic watermarking, secure uploads, and a responsive gallery.

## 🏗️ Architecture

This solution leverages Cloudflare's ecosystem for a completely serverless, globally distributed photo sharing platform:

- **Cloudflare Pages**: Static site hosting + serverless functions
- **Cloudflare R2**: Object storage for original photos (S3-compatible)
- **Cloudflare Images**: On-the-fly image processing and watermarking
- **Cloudflare Access**: Secure authentication for upload interface
- **Cloudflare CDN**: Global edge caching for fast delivery

## 🚀 Features

### Public Gallery
- Responsive grid and list view layouts
- Automatic watermarking with BBFF and HMB Brewing logos
- Lightbox viewer with download functionality
- Real-time updates as new photos are uploaded
- Mobile-optimized with progressive enhancement
- Keyboard navigation support
- Accessibility compliance (WCAG 2.1)

### Secure Upload Portal
- Drag-and-drop file upload interface
- Batch upload support (up to 10 files)
- Real-time upload progress tracking
- File validation and error handling
- Protected by Cloudflare Access authentication

### Performance & Scalability
- Global CDN distribution
- Edge caching with smart invalidation
- Lazy loading and image optimization
- Support for 1000+ concurrent users
- Zero-maintenance serverless architecture

## 📋 Prerequisites

- Node.js 18+ and npm
- Cloudflare account with access to:
  - Pages
  - R2 Object Storage
  - Images
  - Zero Trust (for Access)
- Git for version control

## 🛠️ Setup Instructions

### 1. Clone and Install

```bash
git clone <repository-url>
cd bbff-photo-site
npm install

# Copy and customize the configuration file
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your Cloudflare resource IDs (see step 3 below)
```

### 2. Cloudflare Services Setup

#### R2 Bucket Configuration
1. Navigate to R2 Object Storage in Cloudflare Dashboard
2. Create bucket: `hmbbrew-25th-photos`
3. Generate R2 API tokens (Access Key ID & Secret Access Key)
4. Configure CORS policy:

```json
{
  "AllowedOrigins": ["https://your-domain.com"],
  "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}
```

#### Cloudflare Images Setup
1. Enable Image Resizing in Speed > Optimization
2. Configure Images service
3. Create KV namespace: `BRANDING_ASSETS`
4. Upload branding assets:
   - `bbff-logo.png` (BBFF logo)
   - `hmb-logo.png` (HMB Brewing logo)

#### Cloudflare Access Setup
1. Navigate to Zero Trust Dashboard
2. Create Access Application for `/upload` routes
3. Configure authentication provider (Google, GitHub, etc.)
4. Set up access policies for internal team emails

### 3. Environment Configuration

#### Create Your Configuration File

The project includes a template configuration file that you need to copy and customize:

```bash
# Copy the example configuration
cp wrangler.toml.example wrangler.toml
```

#### Required Configuration Updates

Edit your new `wrangler.toml` file with your specific Cloudflare resources:

**R2 Buckets:**
```toml
[[env.production.r2_buckets]]
binding = "PHOTOS_BUCKET"
bucket_name = "your-production-photos-bucket"  # Replace with your R2 bucket name

[[env.development.r2_buckets]]
binding = "PHOTOS_BUCKET"
bucket_name = "your-development-photos-bucket"  # Replace with your dev R2 bucket name
```

**KV Namespaces:**
```toml
[[env.production.kv_namespaces]]
binding = "BRANDING_ASSETS"
id = "YOUR_PRODUCTION_KV_NAMESPACE_ID"  # Replace with your production KV namespace ID

[[env.development.kv_namespaces]]
binding = "BRANDING_ASSETS"
id = "YOUR_DEVELOPMENT_KV_NAMESPACE_ID"  # Replace with your development KV namespace ID
```

**Analytics Engine (Production Only):**
```toml
[[env.production.analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "your_photo_analytics_dataset"  # Replace with your analytics dataset name
```

#### Finding Your Cloudflare Resource IDs

- **R2 Bucket Names**: Found in Cloudflare Dashboard > R2 Object Storage
- **KV Namespace IDs**: Found in Cloudflare Dashboard > Workers & Pages > KV > Your namespace > Settings
- **Analytics Dataset**: Found in Cloudflare Dashboard > Analytics & Logs > Analytics Engine

#### Security Note

⚠️ **Important**: Your `wrangler.toml` file contains sensitive configuration and is excluded from Git. Never commit it to version control. Only the `wrangler.toml.example` file should be tracked.

### 4. Local Development

```bash
# Start local development server
npm run dev

# Run in development mode with wrangler
wrangler pages dev

# Type checking
npm run type-check

# Linting
npm run lint
```

### 5. Deployment

```bash
# Build for production
npm run build

# Deploy to Cloudflare Pages
npm run deploy

# Or deploy with wrangler
wrangler pages deploy dist
```

## 📁 Project Structure

```
bbff-photo-site/
├── __tests__/                    # Unit and integration tests
│   ├── unit/
│   ├── integration/
│   └── setup.ts
├── docs/                         # Documentation
├── functions/                    # Cloudflare Pages Functions
│   ├── api/
│   │   ├── upload.ts            # Photo upload handler
│   │   ├── list.ts              # Photo listing API
│   │   └── images/[key].ts      # Image serving with watermarks
├── public/                       # Frontend assets
│   ├── index.html               # Main gallery page
│   ├── upload.html              # Upload interface
│   ├── styles/
│   │   ├── main.css             # Main stylesheet
│   │   └── responsive.css       # Mobile optimizations
│   ├── scripts/
│   │   ├── gallery.js           # Gallery functionality
│   │   └── upload.js            # Upload functionality
│   └── assets/                  # Static assets
├── src/                         # Shared utilities
│   ├── types/index.ts           # TypeScript definitions
│   └── utils/                   # Utility functions
├── package.json                 # Dependencies and scripts
├── wrangler.toml.example       # Cloudflare configuration template
├── wrangler.toml               # Your local Cloudflare config (not tracked)
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

## 🧪 Testing

### Test Dependencies

Ensure you have the testing framework installed:

```bash
npm install --save-dev vitest
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run end-to-end tests
npm run test:e2e
```

### Test Coverage Requirements

- Minimum 80% code coverage (branches, functions, lines, statements)
- All critical paths tested
- Error scenarios covered
- Mock external dependencies
- HTML, JSON, and text coverage reports generated

### Test Environment Setup

The project includes comprehensive test setup in [`__tests__/setup.ts`](__tests__/setup.ts:1) that provides:

- **Cloudflare Workers Environment Mocking**: Mock implementations for R2 bucket operations, KV namespace access, Images API, and Analytics
- **Request/Response Mocking**: Custom implementations for testing serverless functions
- **File and FormData Mocking**: Support for testing file upload functionality
- **Test Aliases**: Path shortcuts (`@` for `src/`, `@functions` for `functions/`) configured in [`vitest.config.ts`](vitest.config.ts:30-35)

### Test Structure

```
__tests__/
├── setup.ts              # Test environment configuration
├── unit/                 # Unit tests for utilities and components
├── integration/          # API endpoint integration tests
└── e2e/                  # End-to-end browser tests (Playwright)
```

### Coverage Configuration

Tests generate coverage reports in multiple formats:
- **Text**: Console output during test runs
- **HTML**: Detailed browsable reports in `./coverage/` directory
- **JSON**: Machine-readable coverage data

Coverage exclusions: `node_modules/`, `dist/`, test files, config files, and `public/scripts/*.js`

## 🔧 API Documentation

### Upload Endpoint

**POST** `/api/upload`

Upload photos to the gallery. Protected by Cloudflare Access.

**Request:**
- Content-Type: `multipart/form-data`
- Field: `photos` (multiple files)
- Authentication: Cloudflare Access JWT or X-Upload-Token header

**Response:**
```json
{
  "success": true,
  "photos": [
    {
      "key": "25thAnniversary/filename.jpg",
      "filename": "original-name.jpg",
      "size": 1024576,
      "contentType": "image/jpeg",
      "uploadedAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### List Endpoint

**GET** `/api/list`

Retrieve list of available photos.

**Query Parameters:**
- `limit`: Number of photos to return (default: 50, max: 100)
- `cursor`: Pagination cursor
- `sort`: Sort order (`newest`, `oldest`, `name`, `size`)

**Response:**
```json
{
  "photos": [...],
  "hasMore": false,
  "cursor": null,
  "total": 25
}
```

### Image Serving

**GET** `/api/images/{key}`

Serve processed images with watermarks.

**Query Parameters:**
- `w`: Width in pixels
- `h`: Height in pixels
- `q`: Quality (1-100)
- `watermark`: Apply watermarks (default: true)

## 🎨 Customization

### Branding

Update the following files to customize branding:
- `public/assets/logos/` - Replace logo files
- `public/styles/main.css` - Update color scheme
- `public/index.html` - Update text content

### Watermark Configuration

Modify watermark settings in `src/utils/image-processing.ts`:

```typescript
// BBFF logo: top-left, 100x100px, 80% opacity
// HMB Brewing logo: bottom-right, 100x100px, 80% opacity
```

### Event Configuration

Change the event prefix in function files:

```typescript
const EVENT_PREFIX = '25thAnniversary';
```

## 🔒 Security

### Authentication
- Cloudflare Access protects upload interface
- JWT validation for API endpoints
- Rate limiting on upload endpoints

### Data Protection
- CORS policies for secure uploads
- Input validation and sanitization
- Secure file type checking

### Privacy
- No personal data collection
- Watermarked images only
- Secure token-based authentication

## 📊 Monitoring

### Analytics
- Upload success/failure rates
- Gallery view statistics
- Performance metrics
- Error tracking

### Cloudflare Analytics
- Built-in traffic analytics
- Performance insights
- Cache hit rates
- Geographic distribution

## 🚨 Troubleshooting

### Common Issues

**Upload fails with 401 error:**
- Check Cloudflare Access configuration
- Verify user is in allowed group
- Clear browser cache and cookies

**Images not loading:**
- Check R2 bucket permissions
- Verify Images service is enabled
- Check CORS configuration

**Watermarks not appearing:**
- Verify KV namespace contains logo assets
- Check Images binding configuration
- Review processing function logs

**Slow loading:**
- Check CDN cache settings
- Verify image optimization
- Review edge caching configuration

### Performance Optimization

**Image Loading:**
- Use lazy loading for thumbnails
- Implement progressive image enhancement
- Optimize watermark positioning

**Caching Strategy:**
- Original images: 7 days cache
- Processed images: 7 days cache
- API responses: 30 seconds cache

## 📈 Cost Optimization

### Cloudflare Free Tier Usage
- R2 Storage: 10 GB free
- Image Processing: 5,000 transforms/month free
- Pages Functions: 100,000 requests/month free
- Access: 50 users free

### Expected Costs
For typical event usage (500 photos, 1000 visitors):
- **Monthly cost: $0** (within free tiers)
- Bandwidth: Free (no egress fees)
- Storage: ~2 GB (well within limits)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Ensure code quality standards
5. Submit a pull request

### Code Quality Standards
- TypeScript strict mode
- ESLint and Prettier compliance
- 90% test coverage minimum
- JSDoc documentation for functions

## 📜 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Beach Break Film Festival for event partnership
- Half Moon Bay Brewing Co. for the celebration
- Cloudflare for the serverless platform
- Contributors and photographers

## 📞 Support

For technical support during the event:
- Check the troubleshooting section above
- Review Cloudflare dashboard for errors
- Contact the development team

---

Built with ❤️ for the Beach Break Film Festival and Half Moon Bay Brewing Co. 25th Anniversary celebration.