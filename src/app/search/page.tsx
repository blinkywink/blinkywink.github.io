'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="container py-12">
      <div className="max-w-2xl mx-auto mb-8">
        <div className="relative">
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Search Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Example Product Card */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <Image
            src="/assets/images/coming-soon.png"
            alt="Product"
            width={400}
            height={400}
            className="w-full h-64 object-cover"
          />
          <div className="p-4">
            <h3 className="text-xl font-semibold mb-2">Product Name</h3>
            <p className="text-gray-600 mb-4">$29.99</p>
            <button className="btn-primary w-full">Add to Cart</button>
          </div>
        </div>
        {/* Add more product cards here */}
      </div>
    </div>
  )
} 