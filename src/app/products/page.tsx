'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function ProductsPage() {
  const [category, setCategory] = useState('all')

  return (
    <div className="container py-12">
      <h1 className="text-3xl font-bold mb-8">All Products</h1>
      
      {/* Category Filter */}
      <div className="mb-8">
        <div className="flex space-x-4">
          <button
            className={`px-4 py-2 rounded-md ${
              category === 'all' ? 'bg-black text-white' : 'bg-gray-100'
            }`}
            onClick={() => setCategory('all')}
          >
            All
          </button>
          <button
            className={`px-4 py-2 rounded-md ${
              category === 'hoodies' ? 'bg-black text-white' : 'bg-gray-100'
            }`}
            onClick={() => setCategory('hoodies')}
          >
            Hoodies
          </button>
          <button
            className={`px-4 py-2 rounded-md ${
              category === 'shirts' ? 'bg-black text-white' : 'bg-gray-100'
            }`}
            onClick={() => setCategory('shirts')}
          >
            Shirts
          </button>
        </div>
      </div>
      
      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Example Product */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <Link href="/products/1">
            <Image
              src="/assets/images/coming-soon.png"
              alt="Product"
              width={400}
              height={400}
              className="w-full h-64 object-cover"
            />
          </Link>
          <div className="p-4">
            <Link href="/products/1" className="block">
              <h3 className="text-xl font-semibold mb-2 hover:text-gray-600">Product Name</h3>
            </Link>
            <p className="text-gray-600 mb-4">$29.99</p>
            <button className="btn-primary w-full">Add to Cart</button>
          </div>
        </div>
        
        {/* Add more products here */}
      </div>
    </div>
  )
} 