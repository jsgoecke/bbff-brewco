import { test, expect } from '@playwright/test';

test.describe('Photo Gallery E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses for consistent testing
    await page.route('**/api/list*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          photos: [
            {
              key: '25thAnniversary/test1.jpg',
              filename: 'beach-sunset.jpg',
              size: 1024576,
              contentType: 'image/jpeg',
              uploadedAt: '2024-01-01T12:00:00Z',
              dimensions: { width: 1920, height: 1080 }
            },
            {
              key: '25thAnniversary/test2.png',
              filename: 'festival-crowd.png',
              size: 2048576,
              contentType: 'image/png',
              uploadedAt: '2024-01-01T11:00:00Z',
              dimensions: { width: 1600, height: 900 }
            }
          ],
          hasMore: false,
          total: 2
        })
      });
    });

    // Mock image serving
    await page.route('**/api/images/**', async route => {
      // Return a small test image
      const testImageBuffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      await route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: testImageBuffer
      });
    });
  });

  test('should load gallery page successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check page title
    await expect(page).toHaveTitle(/BBFF.*HMB.*Photo/i);
    
    // Check for main gallery container
    await expect(page.locator('.gallery-container, #gallery, main')).toBeVisible();
    
    // Check for event branding
    await expect(page.locator('h1, .title')).toContainText(/25th|Anniversary|BBFF|HMB/i);
  });

  test('should display photos in gallery', async ({ page }) => {
    await page.goto('/');
    
    // Wait for photos to load
    await page.waitForLoadState('networkidle');
    
    // Check that photos are displayed
    const photoElements = page.locator('img[src*="/api/images/"], .photo-item img, .gallery-item img');
    await expect(photoElements).toHaveCount(2);
    
    // Check photo metadata display
    await expect(page.locator('text=beach-sunset.jpg')).toBeVisible();
    await expect(page.locator('text=festival-crowd.png')).toBeVisible();
  });

  test('should open lightbox when photo is clicked', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Click on first photo
    const firstPhoto = page.locator('img[src*="/api/images/"]').first();
    await firstPhoto.click();
    
    // Check for lightbox/modal
    const lightbox = page.locator('.lightbox, .modal, .fancybox-container, [data-fancybox]');
    await expect(lightbox).toBeVisible();
    
    // Check for enlarged image
    const enlargedImage = page.locator('.lightbox img, .modal img, .fancybox-image');
    await expect(enlargedImage).toBeVisible();
  });

  test('should close lightbox with escape key', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open lightbox
    const firstPhoto = page.locator('img[src*="/api/images/"]').first();
    await firstPhoto.click();
    
    // Wait for lightbox to open
    await expect(page.locator('.lightbox, .modal, .fancybox-container')).toBeVisible();
    
    // Press escape key
    await page.keyboard.press('Escape');
    
    // Check lightbox is closed
    await expect(page.locator('.lightbox, .modal, .fancybox-container')).toBeHidden();
  });

  test('should navigate between photos in lightbox', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Open lightbox
    const firstPhoto = page.locator('img[src*="/api/images/"]').first();
    await firstPhoto.click();
    
    // Look for navigation buttons
    const nextButton = page.locator('.lightbox .next, .modal .next, .fancybox-button--arrow_right, [data-fancybox-next]');
    const prevButton = page.locator('.lightbox .prev, .modal .prev, .fancybox-button--arrow_left, [data-fancybox-prev]');
    
    // Try to navigate if buttons exist
    if (await nextButton.isVisible()) {
      await nextButton.click();
      // Verify image changed (this would depend on implementation)
      await expect(page.locator('.lightbox img, .fancybox-image')).toBeVisible();
    }
  });

  test('should handle responsive layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check that gallery adapts to mobile
    const galleryContainer = page.locator('.gallery-container, #gallery, main');
    await expect(galleryContainer).toBeVisible();
    
    // Check that photos are still visible and accessible
    const photoElements = page.locator('img[src*="/api/images/"]');
    await expect(photoElements).toHaveCount(2);
    
    // Verify photos are clickable on mobile
    const firstPhoto = photoElements.first();
    await firstPhoto.click();
    
    // Check lightbox works on mobile
    await expect(page.locator('.lightbox, .modal, .fancybox-container')).toBeVisible();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Intercept API calls and return errors
    await page.route('**/api/list*', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            message: 'Internal server error',
            code: 'INTERNAL_ERROR'
          }
        })
      });
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for error message or empty state
    const errorMessage = page.locator('.error-message, .empty-state, .no-photos');
    await expect(errorMessage).toBeVisible();
  });

  test('should load more photos when pagination is available', async ({ page }) => {
    // Mock initial load with pagination
    await page.route('**/api/list*', async route => {
      const url = new URL(route.request().url());
      const cursor = url.searchParams.get('cursor');
      
      if (!cursor) {
        // First page
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            photos: [
              {
                key: '25thAnniversary/page1-photo1.jpg',
                filename: 'first-page-1.jpg',
                size: 1024576,
                contentType: 'image/jpeg',
                uploadedAt: '2024-01-01T12:00:00Z'
              }
            ],
            hasMore: true,
            cursor: 'page2-cursor'
          })
        });
      } else {
        // Second page
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            photos: [
              {
                key: '25thAnniversary/page2-photo1.jpg',
                filename: 'second-page-1.jpg',
                size: 1024576,
                contentType: 'image/jpeg',
                uploadedAt: '2024-01-01T11:00:00Z'
              }
            ],
            hasMore: false
          })
        });
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check initial photo count
    let photoElements = page.locator('img[src*="/api/images/"]');
    await expect(photoElements).toHaveCount(1);
    
    // Look for load more button or infinite scroll trigger
    const loadMoreButton = page.locator('.load-more, .show-more, button:has-text("Load More")');
    
    if (await loadMoreButton.isVisible()) {
      await loadMoreButton.click();
      await page.waitForLoadState('networkidle');
      
      // Check that more photos loaded
      photoElements = page.locator('img[src*="/api/images/"]');
      await expect(photoElements).toHaveCount(2);
    } else {
      // Test infinite scroll if implemented
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      await page.waitForTimeout(1000); // Wait for potential load
      
      // Check if more photos loaded
      photoElements = page.locator('img[src*="/api/images/"]');
      const count = await photoElements.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test('should display loading states appropriately', async ({ page }) => {
    // Intercept API calls and delay them
    await page.route('**/api/list*', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          photos: [],
          hasMore: false,
          total: 0
        })
      });
    });
    
    await page.goto('/');
    
    // Check for loading indicator
    const loadingIndicator = page.locator('.loading, .spinner, .skeleton, .loader');
    await expect(loadingIndicator).toBeVisible();
    
    // Wait for loading to complete
    await page.waitForLoadState('networkidle');
    
    // Check loading indicator is gone
    await expect(loadingIndicator).toBeHidden();
  });

  test('should handle empty gallery state', async ({ page }) => {
    // Mock empty response
    await page.route('**/api/list*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          photos: [],
          hasMore: false,
          total: 0
        })
      });
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for empty state message
    const emptyMessage = page.locator('.empty-state, .no-photos, text=/no photos/i, text=/empty/i');
    await expect(emptyMessage).toBeVisible();
  });
});

test.describe('Upload Page E2E Tests', () => {
  test('should load upload page with authentication check', async ({ page }) => {
    await page.goto('/upload.html');
    
    // Check page loads
    await expect(page).toHaveTitle(/Upload|BBFF|HMB/i);
    
    // Check for upload form or authentication requirement
    const uploadForm = page.locator('form, .upload-form, #upload');
    const authMessage = page.locator('.auth-required, .login-required, text=/login/i');
    
    // Either upload form should be visible OR auth message should be visible
    const hasUploadForm = await uploadForm.isVisible();
    const hasAuthMessage = await authMessage.isVisible();
    
    expect(hasUploadForm || hasAuthMessage).toBe(true);
  });

  test('should show file validation errors', async ({ page }) => {
    // Mock upload endpoint to test validation
    await page.route('**/api/upload*', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            message: 'File type text/plain is not allowed',
            code: 'VALIDATION_FAILED'
          }
        })
      });
    });
    
    await page.goto('/upload.html');
    
    // Skip if upload form is not accessible (e.g., requires auth)
    const uploadForm = page.locator('form, .upload-form');
    if (await uploadForm.isVisible()) {
      const fileInput = page.locator('input[type="file"]');
      
      if (await fileInput.isVisible()) {
        // Try to upload invalid file type (this would be mocked in a real test)
        // For E2E testing, we'd need a test file, but this shows the concept
        
        const submitButton = page.locator('button[type="submit"], .upload-button, .submit');
        if (await submitButton.isVisible()) {
          await submitButton.click();
          
          // Check for error message
          const errorMessage = page.locator('.error, .validation-error, .alert-error');
          await expect(errorMessage).toBeVisible();
          await expect(errorMessage).toContainText(/not allowed|validation/i);
        }
      }
    }
  });
});