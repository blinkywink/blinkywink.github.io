import Image from 'next/image'

export default function ProductPage() {
  return (
    <div className="container py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Product Images */}
        <div className="space-y-4">
          <div className="relative aspect-square">
            <Image
              src="/assets/images/coming-soon.png"
              alt="Product"
              fill
              className="object-cover rounded-lg"
            />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="relative aspect-square">
              <Image
                src="/assets/images/coming-soon.png"
                alt="Product thumbnail"
                fill
                className="object-cover rounded-lg"
              />
            </div>
            {/* Add more thumbnails here */}
          </div>
        </div>

        {/* Product Info */}
        <div>
          <h1 className="text-3xl font-bold mb-4">Product Name</h1>
          <p className="text-2xl font-semibold text-gray-900 mb-6">$29.99</p>
          
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Description</h2>
            <p className="text-gray-600">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Size</h2>
            <div className="flex space-x-2">
              {['S', 'M', 'L', 'XL'].map((size) => (
                <button
                  key={size}
                  className="w-12 h-12 border border-gray-300 rounded-md hover:border-black"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-primary w-full">
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
} 